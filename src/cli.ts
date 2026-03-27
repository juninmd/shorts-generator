#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });

import { loadConfig } from "./core/config.js";
import { runPipeline, runTopVideoPipeline } from "./core/pipeline.js";
import { logger } from "./core/logger.js";
import { startServer } from "./server/index.js";

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

      const config = loadConfig(overrides);

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

      const results = isTopCmd 
        ? await runTopVideoPipeline(config, progressLogger)
        : await runPipeline(config, progressLogger);

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

      if (totalErrors > 0 && totalShorts === 0) {
        logger.error("A execução falhou totalmente (0 shorts gerados). Verifique os erros acima.");
        process.exit(1);
      }

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
  generate      Generate shorts from YouTube videos (latest)
  generate:top  Generate shorts from a top video (random from top 20 non-music)
  server        Start the API server

Options (generate):
  --url       Comma-separated YouTube URLs (ex: "url1,url2")
  --channel   Comma-separated channel handles (ex: "@handle1,@handle2")
  --limit     Max videos to fetch per channel (default: 3)
  --clips     Exactly how many clips to generate per video (ex: 2)

Examples:
  pnpm generate --url "https://youtube.com/watch?v=abc,https://youtube.com/watch?v=def"
  pnpm generate --channel "@Handle1,@Handle2" --limit 1 --clips 1
  pnpm generate:top --clips 3

Environment Variables:
  See .env.example for all configuration options.
`);
      break;
    }
  }
}

main().catch((err) => {
  logger.fatal({ error: err }, "Unhandled error");
  process.exit(1);
});
