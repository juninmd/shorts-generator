#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });

import { logger } from "./core/logger.js";
import { startServer } from "./server/index.js";
import { runInteractive } from "./cli-interactive.js";
import { runGenerateCommand } from "./cli-commands/cli-generate.js";
import { runQuizCommand } from "./cli-commands/cli-quiz.js";

// Filter out '--' separator that pnpm/npm passes through
const args = process.argv.slice(2).filter((a) => a !== "--");
const command = args[0];

async function main() {
  switch (command) {
    case "generate":
    case "generate:top": {
      await runGenerateCommand(command, args);
      break;
    }

    case "generate:quiz": {
      await runQuizCommand(args);
      break;
    }

    case "queue:process": {
      const { processQueueUntilEmpty, closeQueueConnections } = await import("./core/queue.js");
      try {
        await processQueueUntilEmpty();
      } finally {
        await closeQueueConnections();
      }
      break;
    }

    case "queue:retry": {
      const { retryFailedWithExistingFiles, closeQueueConnections } = await import("./core/queue.js");
      try {
        await retryFailedWithExistingFiles();
      } finally {
        await closeQueueConnections();
      }
      break;
    }

    case "server": {
      const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
      startServer(String(port));
      break;
    }

    case "interactive": {
      await runInteractive();
      break;
    }

    default: {
      console.log(`
Usage:
  pnpm generate [options]
  pnpm generate:top [options]
  pnpm generate:quiz [options]
  pnpm queue:process
  pnpm queue:retry
  pnpm server
  pnpm interactive

Options (generate):
  --url            Comma-separated list of YouTube URLs to process
  --channel        Comma-separated list of YouTube channel handles to scan
  --limit          Number of recent videos to check per channel (default: 3)
  --clips          Force exactly N cuts per video (overrides LLM judgment)
  --target-shorts  Stop pipeline after processing this many total shorts
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

main().catch((err) => {
  logger.fatal({ error: err }, "Unhandled error");
  process.exit(1);
});
