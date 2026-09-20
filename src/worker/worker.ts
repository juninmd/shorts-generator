import { DelayedError, Worker, type Job } from "bullmq";
import { loadConfig } from "../core/config.js";
import { loadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool, queryRows } from "../core/control-plane-db.js";
import { runControlPlaneMigrations } from "../core/control-plane-migrations.js";
import { sendDailyDashboardDigest } from "../core/feedback/dashboard-notify.js";
import { collectChannelSnapshots } from "../core/feedback/snapshot-collector.js";
import { logger } from "../core/logger.js";
import { getRedisClient } from "../core/queue-client.js";
import { PUBLICATION_QUEUE, REGENERATION_QUEUE, type PublicationJobData } from "../core/publication/publication-queue.js";
import { publishPublication } from "../core/publication/publish-service.js";
import { regeneratePublication } from "../core/publication/regenerate.js";
import { executeRun } from "../core/runs/run-executor.js";
import { enqueueRun, RUN_QUEUE, type RunJobData } from "../core/runs/run-queue.js";
import { buildWorkerContext, type WorkerContext } from "./worker-deps.js";

const DEFER_MS = 60_000;
const ORPHAN_AFTER_MS = 10 * 60 * 1000;

export async function processRunJob(ctx: WorkerContext, job: Job<RunJobData>, token?: string) {
  const outcome = await executeRun(job.data.runId, ctx.runDeps);
  if (outcome.status === "deferred") {
    // Per-channel limit: try again later without consuming an attempt.
    await job.moveToDelayed(Date.now() + DEFER_MS, token);
    throw new DelayedError();
  }
  return outcome;
}

export async function processPublicationJob(ctx: WorkerContext, job: Job<PublicationJobData>) {
  const result = await publishPublication(job.data.publicationId, job.data.version, ctx.publishDeps);
  const record = await ctx.publications.get(job.data.publicationId);
  if (record?.runId) await ctx.runs.refreshStatus(record.runId);
  return result;
}

/** Re-enqueues runs whose job was lost (e.g. Redis flushed) or whose worker died mid-run. */
export async function recoverOrphanRuns(ctx: WorkerContext, now = new Date()): Promise<number> {
  const stale = new Date(now.getTime() - ORPHAN_AFTER_MS).toISOString();
  const rows = await queryRows<{ id: string; channel_id: string; attempts: number }>(ctx.db,
    `SELECT id, channel_id, attempts FROM pipeline_runs WHERE status IN ('queued', 'processing')
     AND (lease_expires_at IS NULL OR lease_expires_at < $1) AND updated_at < $2 LIMIT 50`,
    [now.toISOString(), stale]);
  for (const row of rows) await enqueueRun({ runId: row.id, channelId: row.channel_id }, `r${Number(row.attempts)}-${now.getTime()}`);
  return rows.length;
}

export async function collectAllFeedback(ctx: WorkerContext): Promise<void> {
  for (const bundle of await ctx.bundles.listBundles()) {
    if (bundle.channel.status !== "active") continue;
    try {
      const config = await ctx.resolveChannelConfig(bundle.channel.id, `feedback-${Date.now()}`);
      await collectChannelSnapshots(ctx.db, bundle.channel.id, config);
    } catch (error) {
      logger.warn({ channelId: bundle.channel.id, error: error instanceof Error ? error.message : String(error) }, "Feedback collection failed");
    }
  }
  // Cheap to call every tick: a DB unique constraint keeps it to one message per UTC day.
  try {
    const outcome = await sendDailyDashboardDigest(ctx.db, loadConfig());
    if (outcome === "sent") logger.info("Dashboard digest sent to Telegram");
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, "Dashboard digest failed");
  }
}

export async function startWorkers(): Promise<{ close: () => Promise<void> }> {
  const cp = loadControlPlaneConfig();
  const db = getControlPlanePool(cp);
  await runControlPlaneMigrations(db);
  const ctx = buildWorkerContext(db, cp);
  const connection = getRedisClient() as never;
  // concurrency 1 keeps video processing sequential and one upload at a time.
  const workers = [
    new Worker<RunJobData>(RUN_QUEUE, (job, token) => processRunJob(ctx, job, token), { connection, concurrency: 1, lockDuration: 120_000 }),
    new Worker<PublicationJobData>(PUBLICATION_QUEUE, (job) => processPublicationJob(ctx, job), { connection, concurrency: 1 }),
    new Worker<PublicationJobData>(REGENERATION_QUEUE, (job) => regeneratePublication(job.data.publicationId, job.data.version, ctx.regenerateDeps), { connection, concurrency: 1 }),
  ];
  for (const w of workers) {
    w.on("failed", (job, err) => logger.error({ queue: w.name, jobId: job?.id, attemptsMade: job?.attemptsMade, error: err.message }, "Worker job failed"));
  }
  const recovered = await recoverOrphanRuns(ctx);
  logger.info({ recovered }, "Workers started");
  const hours = Number(process.env.FEEDBACK_COLLECT_INTERVAL_HOURS ?? "6");
  const timer = hours > 0 ? setInterval(() => void collectAllFeedback(ctx), hours * 3_600_000) : null;
  timer?.unref();
  return {
    close: async () => {
      if (timer) clearInterval(timer);
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}
