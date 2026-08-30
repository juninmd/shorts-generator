
import { randomUUID } from "node:crypto";
import { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import { ChannelConfigResolver, buildManagedPipelineConfig } from "../core/channel-config-resolver.js";
import { loadConfig } from "../core/config.js";
import { loadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { runPipeline } from "../core/pipeline.js";
import { runQuizPipeline } from "../core/quiz/quiz-pipeline.js";
import { ManagedRunRepository } from "../core/managed-run-repository.js";
import { logger } from "../core/logger.js";
import { createSecretStore } from "../core/secret-store.js";
import { runControlPlaneMigrations } from "../core/control-plane-migrations.js";
import type { PipelineConfig, PipelineProgress } from "../types.js";

export async function runManagedChannel(channelId: string, baseConfig = loadConfig(), overrides?: Partial<PipelineConfig>): Promise<void> {
  const controlPlaneConfig = loadControlPlaneConfig();
  const db = getControlPlanePool(controlPlaneConfig);
  const repository = new ChannelBundleRepository(db as any);
  const runRepository = new ManagedRunRepository(db as any);
  const resolver = new ChannelConfigResolver(repository, createSecretStore(controlPlaneConfig));
  const runId = randomUUID();

  await runControlPlaneMigrations(db as any);
  const resolved = await resolver.resolveRunConfig(runId, channelId);
  const config = buildManagedPipelineConfig(baseConfig, runId, resolved, overrides);

  await runRepository.createRun(runId, channelId, "cli", {
    channel: resolved.channel,
    profile: resolved.profile,
    focuses: resolved.focuses,
    sources: resolved.sources,
    youtubeAccount: {
      provider: resolved.publishingAccount.provider,
      accountId: resolved.publishingAccount.accountId,
      accountIdentifier: resolved.publishingAccount.accountIdentifier,
    },
  });

  try {
    const results = await runPipeline(config, (progress) => {
      void runRepository.updateProgress(runId, progress as PipelineProgress);
      logger.info({ stage: progress.stage, progress: `${Math.round(progress.progress)}%`, message: progress.message, runId, channelId }, "Pipeline status");
    });
    await runRepository.completeRun(runId, results);
  } catch (error) {
    await runRepository.failRun(runId, error);
    throw error;
  }
}

export async function runQuizManagedChannel(channelId: string, quizTopic?: string, baseConfig = loadConfig()): Promise<void> {
  const controlPlaneConfig = loadControlPlaneConfig();
  const db = getControlPlanePool(controlPlaneConfig);
  const repository = new ChannelBundleRepository(db as any);
  const runRepository = new ManagedRunRepository(db as any);
  const resolver = new ChannelConfigResolver(repository, createSecretStore(controlPlaneConfig));
  const runId = randomUUID();

  await runControlPlaneMigrations(db as any);
  const resolved = await resolver.resolveRunConfig(runId, channelId);
  const config = buildManagedPipelineConfig(baseConfig, runId, resolved);

  await runRepository.createRun(runId, channelId, "cli", {
    channel: resolved.channel,
    profile: resolved.profile,
    focuses: resolved.focuses,
    sources: resolved.sources,
    youtubeAccount: {
      provider: resolved.publishingAccount.provider,
      accountId: resolved.publishingAccount.accountId,
      accountIdentifier: resolved.publishingAccount.accountIdentifier,
    },
  });

  try {
    const result = await runQuizPipeline(config, async (progress) => {
      await runRepository.updateProgress(runId, progress as PipelineProgress).catch((e) => logger.warn({ e }, "progress update failed"));
      logger.info({ stage: progress.stage, progress: `${Math.round(progress.progress)}%`, message: progress.message, runId, channelId }, "Quiz Pipeline status");
    }, quizTopic);
    await runRepository.completeRun(runId, []);
    logger.info({ runId, channelId, success: result.success, youtubeUrl: result.youtubeUrl }, "✅ Quiz pipeline completed");
  } catch (error) {
    await runRepository.failRun(runId, error);
    throw error;
  }
}
