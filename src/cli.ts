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

      if (urlIndex !== -1 && args[urlIndex + 1]) {
        overrides.specificUrls = args[urlIndex + 1]!.split(",").map((u) => u.trim());
      }

      if (channelIndex !== -1 && args[channelIndex + 1]) {
        overrides.channels = args[channelIndex + 1]!.split(",").map((c) => c.trim());
      }

      if (limitIndex !== -1 && args[limitIndex + 1]) {
        overrides.videoLimit = parseInt(args[limitIndex + 1]!, 10);
      }

      if (clipsIndex !== -1 && args[clipsIndex + 1]) {
        const n = parseInt(args[clipsIndex + 1]!, 10);
        overrides.maxClipsOverride = n;
        overrides.minShortsPerVideo = Math.min(n, overrides.minShortsPerVideo ?? n);
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
        },
        "Starting shorts generation",
      );

      const progressLogger = (progress: any) => {
        logger.info(
          {
            stage: progress.stage,
            progress: `${progress.progress.toFixed(0)}%`,
            message: progress.message,
          },
          "Pipeline progress",
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
          totalTimeMs: results.reduce((sum, r) => sum + r.processingTimeMs, 0),
        },
        "Pipeline complete",
      );

      if (totalErrors > 0) {
        for (const result of results) {
          for (const error of result.errors) {
            logger.error({ videoId: result.videoId }, error);
          }
        }
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
  generate:top  Generate shorts from a top 20 non-music video randomly 1x day
  server        Start the API server

Options (generate):
  --url <urls>        Comma-separated YouTube video URLs
  --channel <ids>     Comma-separated channel handles/URLs
  --limit <n>         Number of videos to fetch per channel (default: 3)
  --clips <n>         Max clips to generate per video — useful for quick tests

Examples:
  pnpm run cli -- generate --url "https://youtube.com/watch?v=xxx"
  pnpm run cli -- generate --url "https://youtube.com/watch?v=xxx" --clips 1
  pnpm run cli -- generate --channel "@channelHandle" --limit 1 --clips 1
  pnpm run cli -- generate --limit 5

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
