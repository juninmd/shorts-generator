import { randomUUID } from "node:crypto";
import { loadConfig } from "../core/config.js";
import { loadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { runControlPlaneMigrations } from "../core/control-plane-migrations.js";
import { logger } from "../core/logger.js";
import type { RunOptions } from "../core/runs/durable-run-repository.js";
import { executeRun } from "../core/runs/run-executor.js";
import type { PipelineConfig } from "../types.js";
import { buildWorkerContext } from "../worker/worker-deps.js";

/** CLI runs use the same durable record/lease/checkpoint path as the worker, executed in-process. */
async function runDurable(channelId: string, options: RunOptions): Promise<void> {
  const cp = loadControlPlaneConfig();
  const db = getControlPlanePool(cp);
  await runControlPlaneMigrations(db);
  const ctx = buildWorkerContext(db, cp);
  const runId = randomUUID();
  const bundle = await ctx.bundles.getBundle(channelId);
  if (!bundle) throw new Error(`Channel ${channelId} not found`);
  await ctx.runs.createQueuedRun(runId, channelId, "cli", { channel: bundle.channel, profile: bundle.profile }, options);
  const outcome = await executeRun(runId, ctx.runDeps);
  logger.info({ runId, channelId, outcome }, "Managed run finished");
  if (outcome.status === "deferred") throw new Error(`Run ${runId} deferred: ${outcome.reason}`);
  if (outcome.status === "failed") process.exitCode = 1;
}

export async function runManagedChannel(channelId: string, _baseConfig = loadConfig(), overrides?: Partial<PipelineConfig>): Promise<void> {
  await runDurable(channelId, { kind: "cuts", overrides: overrides as Record<string, unknown> | undefined });
}

export async function runQuizManagedChannel(channelId: string, quizTopic?: string, _baseConfig = loadConfig()): Promise<void> {
  await runDurable(channelId, { kind: "quiz", quizTopic });
}
