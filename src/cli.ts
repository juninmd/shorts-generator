#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });

import { randomUUID } from "node:crypto";
import { ChannelBundleRepository } from "./core/channel-bundle-repository.js";
import { ChannelConfigResolver, buildManagedPipelineConfig } from "./core/channel-config-resolver.js";
import { loadConfig } from "./core/config.js";
import { loadControlPlaneConfig } from "./core/control-plane-config.js";
import { getControlPlanePool } from "./core/control-plane-db.js";
import { runPipeline, runTopVideoPipeline } from "./core/pipeline.js";
import { runQuizPipeline } from "./core/quiz/quiz-pipeline.js";
import { ManagedRunRepository } from "./core/managed-run-repository.js";
import { logger } from "./core/logger.js";
import { createSecretStore } from "./core/secret-store.js";
import { startServer } from "./server/index.js";
import { runInteractive } from "./cli-interactive.js";
import { runControlPlaneMigrations } from "./core/control-plane-migrations.js";

// Filter out '--' separator that pnpm/npm passes through
const args = process.argv.slice(2).filter((a) => a !== "--");
const command = args[0];

async function main() {
  switch (command) {
    case "generate":
    case "generate:top": {
      const isTopCmd = command === "generate:top";
      const urlIndex = args.indexOf("--url");
      const channelIndex = args.indexOf("--channel");
      const limitIndex = args.indexOf("--limit");
      const clipsIndex = args.indexOf("--clips");
      const targetShortsIndex = args.indexOf("--target-shorts");
      const fullCountIndex = args.indexOf("--full");
      const queryIndex = args.indexOf("--query");
      const managedChannelIndex = args.indexOf("--managed-channel");

      const overrides: Record<string, any> = {};

      // 1. Handle Multiple URLs
      if (urlIndex !== -1 && args[urlIndex + 1]) {
        const rawUrls = args[urlIndex + 1]!;
        overrides.specificUrls = rawUrls.split(",").map((u) => u.trim()).filter(Boolean);
        // If URLs are provided via CLI, ignore default channels from .env unless explicitly provided
        if (channelIndex === -1) {
          overrides.channels = [];
        }
      }

      // 2. Handle Multiple Channels
      if (channelIndex !== -1 && args[channelIndex + 1]) {
        const rawChannels = args[channelIndex + 1]!;
        overrides.channels = rawChannels.split(",").map((c) => c.trim()).filter(Boolean);
      }

      // 3. Video Limit per Channel
      if (limitIndex !== -1 && args[limitIndex + 1]) {
        overrides.videoLimit = parseInt(args[limitIndex + 1]!, 10);
      }

      // 4. Clips Guarantee (Force specific quantity of cuts)
      if (clipsIndex !== -1 && args[clipsIndex + 1]) {
        const n = parseInt(args[clipsIndex + 1]!, 10);
        if (!isNaN(n)) {
          overrides.maxClipsOverride = n;
          // We set min/max to the same value to 'force' the AI to aim for exactly that
          overrides.minShortsPerVideo = n;
          logger.info({ clipsRequested: n }, "🎯 Limite de cortes definido manualmente via --clips");
        }
      }

      // 5. Total short clips target for runPipeline
      if (targetShortsIndex !== -1 && args[targetShortsIndex + 1]) {
        const n = parseInt(args[targetShortsIndex + 1]!, 10);
        if (!isNaN(n) && n > 0) {
          overrides.targetShorts = n;
          logger.info({ targetShorts: n }, "🎯 Meta de shorts definida via --target-shorts");
        }
      }

      // 6. Top full videos count for runTopVideoPipeline
      let topVideosCount = 1;
      if (fullCountIndex !== -1 && args[fullCountIndex + 1]) {
        const n = parseInt(args[fullCountIndex + 1]!, 10);
        if (!isNaN(n) && n > 0) {
          topVideosCount = n;
          overrides.fullVideoCount = n;
          logger.info({ fullVideoCount: n }, "🎯 Meta de vídeos completos definida via --full");
        }
      }

      // 7. Video title query filter
      if (queryIndex !== -1 && args[queryIndex + 1]) {
        overrides.videoQuery = args[queryIndex + 1]!;
        logger.info({ videoQuery: overrides.videoQuery }, "🔍 Filtro de título definido via --query");
      }

      const managedChannelId = managedChannelIndex !== -1 ? args[managedChannelIndex + 1]?.trim() : undefined;
      const baseConfig = loadConfig(overrides);

      if (managedChannelId) {
        await runManagedChannel(managedChannelId, baseConfig);
        break;
      }

      const config = baseConfig;

      if (config.channels.length === 0 && config.specificUrls.length === 0) {
        logger.error(
          "No channels or URLs provided. Set YOUTUBE_CHANNELS env var or use --url / --channel flags.",
        );
        process.exit(1);
      }

      logger.info(
        {
          channels: config.channels,
          urls: config.specificUrls,
          videoLimit: config.videoLimit,
          maxClipsReq: config.maxClipsOverride || 'AUTO',
        },
        "🚀 Iniciando geração de shorts",
      );

      const progressLogger = (progress: any) => {
        logger.info(
          {
            stage: progress.stage,
            progress: `${Math.round(progress.progress)}%`,
            message: progress.message,
          },
          "Pipeline status",
        );
      };

      const results = [];

      if (isTopCmd) {
        for (let i = 0; i < topVideosCount; i++) {
          const partial = await runTopVideoPipeline(config, progressLogger);
          results.push(...partial);
          if (partial.length === 0) {
            logger.warn({ iteration: i + 1 }, "Nenhum vídeo completo válido encontrado nesta iteração");
            break;
          }
        }
      } else {
        results.push(...await runPipeline(config, progressLogger));
      }

      // Summary
      const totalShorts = results.reduce((sum, r) => sum + r.shorts.length, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      logger.info(
        {
          videosProcessed: results.length,
          totalShorts,
          totalErrors,
          totalTimeSec: Math.round(results.reduce((sum, r) => sum + r.processingTimeMs, 0) / 1000),
        },
        "✅ Pipeline finalizada",
      );

      if (totalErrors > 0) {
        logger.error("A execução finalizou com erros. Verifique os detalhes acima.");
        process.exit(1);
      }

      break;
    }

    case "generate:quiz": {
      const promptIndex = args.indexOf("--prompt");
      const quizTopic = promptIndex !== -1 ? args[promptIndex + 1] : undefined;
      
      const overrides: Record<string, any> = {};
      const config = loadConfig(overrides);

      const progressLogger = (progress: any) => {
        logger.info(
          {
            stage: progress.stage,
            progress: `${Math.round(progress.progress)}%`,
            message: progress.message,
          },
          "Quiz Pipeline status",
        );
      };

      try {
        const result = await runQuizPipeline(config, progressLogger, quizTopic);
        logger.info(
          {
            success: result.success,
            outputPath: result.outputPath,
            telegramSent: result.telegramSent,
            youtubeUrl: result.youtubeUrl,
          },
          "✅ Pipeline de Quiz finalizada com sucesso!",
        );
      } catch (err: any) {
        logger.error({ error: err.message }, "❌ Falha ao rodar pipeline de quiz");
        process.exit(1);
      }
      break;
    }

    case "interactive":
    case undefined: {
      await runInteractive();
      break;
    }

    case "server": {
      startServer();
      break;
    }

    default: {
      console.log(`
╔══════════════════════════════════════════════╗
║         🎬 Shorts Generator CLI             ║
╚══════════════════════════════════════════════╝

Usage:
  pnpm run cli -- <command> [options]

Commands:
  interactive   Interactive menu — choose channel/URL, order, and clip count (default when no command given)
  generate      Generate shorts from YouTube videos (latest)
  generate:top  Generate shorts from a top video (random from top 20 non-music)
  generate:quiz Generate a new educational quiz short
  server        Start the API server

Options (generate):
  --url            Comma-separated YouTube URLs (ex: "url1,url2")
  --channel        Comma-separated channel handles (ex: "@handle1,@handle2")
  --limit          Max videos to fetch per channel (default: 3)
  --clips          Exactly how many clips to generate per video (ex: 2)
  --target-shorts  Total number of shorts to generate in this run (ex: 15)
  --query          Filter videos by title (case-insensitive substring match)
  --full           For generate:top, number of full videos to post (ex: 5)

Options (generate:quiz):
  --prompt         The topic or specific question for the quiz (ex: "História do Brasil")

Examples:
  pnpm generate --url "https://youtube.com/watch?v=abc,https://youtube.com/watch?v=def"
  pnpm generate --channel "@Handle1,@Handle2" --limit 1 --clips 1
  pnpm generate:top --clips 3
  pnpm generate:quiz --prompt "Curiosidades sobre o Espaço"

Environment Variables:
  See .env.example for all configuration options.
`);
      break;
    }
  }
}

async function runManagedChannel(channelId: string, baseConfig = loadConfig()): Promise<void> {
  const controlPlaneConfig = loadControlPlaneConfig();
  const db = getControlPlanePool(controlPlaneConfig);
  const repository = new ChannelBundleRepository(db);
  const runRepository = new ManagedRunRepository(db);
  const resolver = new ChannelConfigResolver(repository, createSecretStore(controlPlaneConfig));
  const runId = randomUUID();

  await runControlPlaneMigrations(db);
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
    const results = await runPipeline(config, (progress) => {
      void runRepository.updateProgress(runId, progress);
      logger.info({ stage: progress.stage, progress: `${Math.round(progress.progress)}%`, message: progress.message, runId, channelId }, "Pipeline status");
    });
    await runRepository.completeRun(runId, results);
  } catch (error) {
    await runRepository.failRun(runId, error);
    throw error;
  }
}

main().catch((err) => {
  logger.fatal({ error: err }, "Unhandled error");
  process.exit(1);
});
