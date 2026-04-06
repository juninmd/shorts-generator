#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });

import { loadConfig } from "./core/config.js";
import { runPipeline, runTopVideoPipeline } from "./core/pipeline.js";
import { logger } from "./core/logger.js";
import { startServer } from "./server/index.js";
import { runInteractive } from "./cli-interactive.js";

// Filter out '--' separator that pnpm/npm passes through
const args = process.argv.slice(2).filter((a) => a !== "--");
const command = args[0];

async function main() {
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

  switch (command) {
    case "generate:radar": {
      logger.info("📡 Iniciando Radar Católico (Modo Autônomo)");
      const config = loadConfig({
        catholicRadar: true,
        channels: [], // Ignore default channels from .env
        specificUrls: [],
        videoLimit: 2, // Default limit for radar
      });

      const results = await runPipeline(config, progressLogger);
      printSummary(results);
      break;
    }

    case "generate:top": {
      const fullCountIndex = args.indexOf("--full");
      let topVideosCount = 1;
      if (fullCountIndex !== -1 && args[fullCountIndex + 1]) {
        topVideosCount = parseInt(args[fullCountIndex + 1]!, 10) || 1;
      }

      logger.info({ topVideosCount }, "🚀 Gerando shorts dos vídeos mais populares");
      const config = loadConfig();
      const results = [];

      for (let i = 0; i < topVideosCount; i++) {
        const partial = await runTopVideoPipeline(config, progressLogger);
        results.push(...partial);
        if (partial.length === 0) break;
      }
      printSummary(results);
      break;
    }

    case "generate": {
      const urlIndex = args.indexOf("--url");
      const channelIndex = args.indexOf("--channel");
      const limitIndex = args.indexOf("--limit");
      const clipsIndex = args.indexOf("--clips");
      const targetShortsIndex = args.indexOf("--target-shorts");

      const overrides: Record<string, any> = {};

      if (urlIndex !== -1 && args[urlIndex + 1]) {
        overrides.specificUrls = args[urlIndex + 1]!.split(",").map((u) => u.trim()).filter(Boolean);
        if (channelIndex === -1) overrides.channels = [];
      }

      if (channelIndex !== -1 && args[channelIndex + 1]) {
        overrides.channels = args[channelIndex + 1]!.split(",").map((c) => c.trim()).filter(Boolean);
      }

      if (limitIndex !== -1 && args[limitIndex + 1]) {
        overrides.videoLimit = parseInt(args[limitIndex + 1]!, 10);
      }

      if (clipsIndex !== -1 && args[clipsIndex + 1]) {
        const n = parseInt(args[clipsIndex + 1]!, 10);
        overrides.maxClipsOverride = n;
        overrides.minShortsPerVideo = n;
      }

      if (targetShortsIndex !== -1 && args[targetShortsIndex + 1]) {
        overrides.targetShorts = parseInt(args[targetShortsIndex + 1]!, 10);
      }

      const config = loadConfig(overrides);
      logger.info("🚀 Iniciando geração padrão de shorts");
      const results = await runPipeline(config, progressLogger);
      printSummary(results);
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
  interactive     Interactive menu — choose channel/URL, order, and clip count (default)
  generate        Generate shorts from YouTube videos (latest)
  generate:top    Generate shorts from a top video (random from top 20 non-music)
  generate:radar  Search for catholic guests in podcasts and generate shorts
  server          Start the API server

Options (generate):
  --url            Comma-separated YouTube URLs (ex: "url1,url2")
  --channel        Comma-separated channel handles (ex: "@handle1,@handle2")
  --limit          Max videos to fetch per channel (default: 3)
  --clips          Exactly how many clips to generate per video (ex: 2)
  --target-shorts  Total number of shorts to generate in this run (ex: 15)
  --full           For generate:top, number of full videos to post (ex: 5)

Examples:
  pnpm generate --url "https://youtube.com/watch?v=abc,https://youtube.com/watch?v=def"
  pnpm generate:radar
  pnpm generate:top --clips 3

Environment Variables:
  See .env.example for all configuration options.
`);
      break;
    }
  }
}

/**
 * Helper to print a summary of the pipeline execution.
 */
function printSummary(results: any[]) {
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
}

main().catch((err) => {
  logger.fatal({ error: err }, "Unhandled error");
  process.exit(1);
});
