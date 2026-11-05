

import type { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { buildManagedPipelineConfig } from "../core/channel-config-resolver.js";
import { loadConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import { runPipeline } from "../core/pipeline.js";
import { runQuizPipeline } from "../core/quiz/quiz-pipeline.js";
import type { PipelineProgress } from "../types.js";
import { channelIdSchema } from "./admin-schemas.js";
import { type AdminDeps, isCutsOnlyMode, mapQuizResultToPipeline } from "./admin-helpers.js";

type Resolved = Awaited<ReturnType<AdminDeps["resolver"]["resolveRunConfig"]>>;

function snapshotOf(resolved: Resolved) {
  return {
    channel: resolved.channel,
    profile: resolved.profile,
    focuses: resolved.focuses,
    sources: resolved.sources,
    youtubeAccount: {
      id: resolved.publishingAccount.accountId,
      provider: resolved.publishingAccount.provider,
      label: resolved.channel.name,
      status: resolved.channel.status,
      accountIdentifier: resolved.publishingAccount.accountIdentifier,
    },
  };
}

export function registerRunRoutes(admin: Hono, deps: AdminDeps): void {
  const { runRepository, resolver } = deps;

  admin.post("/channels/:channelId/runs", async (c) => {
    const adminId = "system";
    const channelId = channelIdSchema.parse(c.req.param("channelId"));
    const runId = randomUUID();
    const resolved = await resolver.resolveRunConfig(runId, channelId);
    if (isCutsOnlyMode() && resolved.channel.channelType !== "cuts") {
      return c.json({ error: "Quiz runs are disabled while CHANNEL_FLOW_MODE=cuts" }, 409);
    }
    if (deps.enqueueRun) {
      // Durable path: the run survives restarts and is executed by the worker.
      await runRepository.createQueuedRun(runId, channelId, adminId, snapshotOf(resolved), { kind: resolved.channel.channelType });
      try {
        await deps.enqueueRun({ runId, channelId });
      } catch (error) {
        await runRepository.markFailed(runId, new Error(`queue unavailable: ${error instanceof Error ? error.message : String(error)}`));
        return c.json({ runId, status: "failed", error: "Run queue unavailable" }, 503);
      }
      logger.info({ adminId, channelId, runId, action: "run" }, "Run queued");
      return c.json({ runId, status: "queued" }, 202);
    }
    await runRepository.createRun(runId, channelId, adminId, snapshotOf(resolved));
    const configForRun = buildManagedPipelineConfig(loadConfig(), runId, resolved);
    void (async () => {
      try {
        if (resolved.channel.channelType === "quiz") {
          const result = await runQuizPipeline(configForRun, async (progress) => {
            await runRepository.updateProgress(runId, {
              stage: progress.stage as PipelineProgress["stage"],
              progress: progress.progress,
              message: progress.message,
            }).catch(() => {});
          });
          await runRepository.completeRun(runId, [mapQuizResultToPipeline(result, resolved.channel.name)]);
        } else {
          const results = await runPipeline(configForRun, (progress) => {
            void runRepository.updateProgress(runId, progress);
          });
          await runRepository.completeRun(runId, results);
        }
      } catch (error) {
        await runRepository.failRun(runId, error);
      }
    })();

    logger.info({ adminId, channelId, action: "run" }, "Channel updated");
    return c.json({ runId, status: "processing" }, 202);
  });

  admin.post("/runs/:runId/retry", async (c) => {
    const runId = c.req.param("runId");
    if (!deps.enqueueRun) return c.json({ error: "Durable runs are not configured" }, 501);
    const state = await runRepository.getExecutionState(runId);
    if (!state) return c.json({ error: "Run not found" }, 404);
    if (!(await runRepository.requeue(runId))) return c.json({ error: `Run cannot be retried from status ${state.status}` }, 409);
    // Checkpointed videos are skipped by the executor, so a retry only redoes missing work.
    await deps.enqueueRun({ runId, channelId: state.channelId }, `retry${state.attempts}`);
    return c.json({ runId, status: "queued" }, 202);
  });

  admin.get("/runs", async (c) => {
    const channelId = c.req.query("channelId") || undefined;
    const limit = Math.min(Math.max(Number(c.req.query("limit") || "20") || 20, 1), 100);
    const offset = Number(c.req.query("offset") || "0");
    return c.json(await runRepository.listRuns(channelId, limit, offset));
  });

  admin.get("/runs/:runId", async (c) => {
    const run = await runRepository.getRun(c.req.param("runId"));
    if (!run) {
      return c.json({ error: "Run not found" }, 404);
    }
    return c.json(run);
  });
}



