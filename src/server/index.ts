import { serve } from "@hono/node-server";
import { config as dotenvConfig } from "dotenv";
import { app } from "./routes.js";
import { logger } from "../core/logger.js";

dotenvConfig();

export function startServer(): void {
  const port = parseInt(process.env.PORT ?? "3001", 10);

  logger.info({ port }, "Starting Shorts Generator API server");

  const server = serve({ fetch: app.fetch, port }, (info) => {
    logger.info(`Server running at http://localhost:${info.port}`);
    logger.info(`API docs: http://localhost:${info.port}/api/health`);
  });

  const shutdown = () => {
    logger.info("Shutting down server...");
    server.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// Start the server if this file is run directly
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

function checkIsMain(): boolean {
  if (!process.argv[1]) return false;
  
  try {
    const scriptPath = realpathSync(process.argv[1]);
    const modulePath = realpathSync(fileURLToPath(import.meta.url));
    return scriptPath === modulePath || modulePath.includes(process.argv[1].replace(/\.[tj]s$/, ""));
  } catch {
    return fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\.[tj]s$/, ""));
  }
}

const isMain = checkIsMain();

if (isMain) {
  startServer();
}
