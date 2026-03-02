import { serve } from "@hono/node-server";
import { config as dotenvConfig } from "dotenv";
import { app } from "./routes.js";
import { logger } from "../core/logger.js";

dotenvConfig();

const port = parseInt(process.env.PORT ?? "3001", 10);

logger.info({ port }, "Starting Shorts Generator API server");

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Server running at http://localhost:${info.port}`);
  logger.info(`API docs: http://localhost:${info.port}/api/health`);
});
