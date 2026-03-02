#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import { loadConfig } from "./core/config.js";
import { runPipeline, processUrl } from "./core/pipeline.js";
import { logger } from "./core/logger.js";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "generate": {
      const urlIndex = args.indexOf("--url");
      const channelIndex = args.indexOf("--channel");
      const daysIndex = args.indexOf("--days");

      const overrides: Record<string, any> = {};

      if (urlIndex !== -1 && args[urlIndex + 1]) {
        overrides.specificUrls = args[urlIndex + 1]!.split(",").map((u) => u.trim());
      }

      if (channelIndex !== -1 && args[channelIndex + 1]) {
        overrides.channels = args[channelIndex + 1]!.split(",").map((c) => c.trim());
      }

      if (daysIndex !== -1 && args[daysIndex + 1]) {
        overrides.daysBack = parseInt(args[daysIndex + 1]!, 10);
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
          daysBack: config.daysBack,
        },
        "Starting shorts generation",
      );

      const results = await runPipeline(config, (progress) => {
        logger.info(
          {
            stage: progress.stage,
            progress: `${progress.progress.toFixed(0)}%`,
            message: progress.message,
          },
          "Pipeline progress",
        );
      });

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
      // Dynamically import and start the server
      await import("./server/index.js");
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
  generate    Generate shorts from YouTube videos
  server      Start the API server

Options (generate):
  --url <urls>        Comma-separated YouTube video URLs
  --channel <ids>     Comma-separated channel handles/URLs
  --days <n>          Number of days back to fetch (default: 1)

Examples:
  pnpm run cli -- generate --url "https://youtube.com/watch?v=xxx"
  pnpm run cli -- generate --channel "@channelHandle"
  pnpm run cli -- generate --days 3

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
