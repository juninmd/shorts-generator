import { serve } from "@hono/node-server";
import { config as dotenvConfig } from "dotenv";
import { app } from "./routes.js";
import { logger } from "../core/logger.js";

dotenvConfig();

export function startServer(): void {
  const port = parseInt(process.env.PORT ?? "3001", 10);

  logger.info({ port }, "Starting Shorts Generator API server");

  serve({ fetch: app.fetch, port }, (info) => {
    logger.info(`Server running at http://localhost:${info.port}`);
    logger.info(`API docs: http://localhost:${info.port}/api/health`);
  });
}

// Start the server if this file is run directly
import { fileURLToPath } from "node:url";
const isMain = process.argv[1] && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\.[tj]s$/, ""));

if (isMain) {
  startServer();
}
