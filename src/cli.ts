#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ override: true });

import { logger } from "./core/logger.js";
import { startServer } from "./server/index.js";
import { runInteractive } from "./cli-interactive.js";
import { runGenerateCommand } from "./cli-commands/cli-generate.js";
import { runQuizCommand } from "./cli-commands/cli-quiz.js";
import { runMetricsDigestCommand } from "./cli-commands/cli-metrics-digest.js";

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

    case "generate:metrics-digest": {
      await runMetricsDigestCommand();
      break;
    }

    case "generate:comic":
    case "generate:movie":
    case "generate:series":
    case "generate:bio":
    case "generate:news":
    case "generate:book": {
      const { runComicCommand } = await import("./cli-commands/cli-comic.js");
      const kind = command.split(":")[1] as import("./cli-commands/cli-comic.js").StoryKind;
      await runComicCommand(kind, args);
      break;
    }

    case "queue:process": {
      const { processQueueUntilEmpty } = await import("./core/queue.js");
      await processQueueUntilEmpty();
      break;
    }

    case "queue:retry": {
      const { retryFailedWithExistingFiles } = await import("./core/queue.js");
      await retryFailedWithExistingFiles();
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
  pnpm generate:metrics-digest
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

// "server" and "interactive" are long-running: they must keep the Redis connection
// open for their own lifetime. Every other command is one-shot and may have enqueued
// a BullMQ upload (queue-client.ts), which opens a persistent ioredis connection that
// Node never exits on its own while alive — leaving it open hangs the CronJob pod
// until activeDeadlineSeconds kills it. closeQueueConnections() is a no-op when no
// connection was ever opened, so it's safe to call unconditionally here.
const LONG_RUNNING_COMMANDS = new Set(["server", "interactive"]);

main()
  .catch((err) => {
    logger.fatal({ error: err }, "Unhandled error");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (LONG_RUNNING_COMMANDS.has(command)) return;
    const { closeQueueConnections } = await import("./core/queue-client.js");
    await closeQueueConnections();
  });

