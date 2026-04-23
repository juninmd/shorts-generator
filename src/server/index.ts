import { serve } from "@hono/node-server";
import { config as dotenvConfig } from "dotenv";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./routes.js";
import { logger } from "../core/logger.js";

dotenvConfig();

type ServerHandle = ReturnType<typeof serve>;

export function startServer(portValue = process.env.PORT): void {
  const port = parsePort(portValue);

  logger.info({ port }, "Starting Shorts Generator API server");

  let server: ServerHandle;
  try {
    server = serve({ fetch: app.fetch, port }, (info) => {
      logger.info(`Server running at http://localhost:${info.port}`);
      logger.info(`API docs: http://localhost:${info.port}/api/health`);
    });
  } catch (error) {
    logger.error({ error, port }, "Failed to start API server");
    throw error;
  }

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Shutting down server...");
    closeServer(server, signal);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function parsePort(value: string | undefined): number {
  const raw = value ?? "3001";
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid PORT value: ${raw}`);
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new Error(`PORT must be between 1 and 65535: ${raw}`);
  }
  return port;
}

function closeServer(server: ServerHandle, signal: NodeJS.Signals): void {
  let exited = false;
  const finish = (error?: Error) => {
    /* v8 ignore next */
    if (exited) return;
    exited = true;
    if (error) logger.error({ error, signal }, "Error while shutting down server");
    process.exit(error ? 1 : 0);
  };

  try {
    server.close(finish);
    if (server.close.length === 0) finish();
  } catch (error) {
    /* v8 ignore next */
    finish(error instanceof Error ? error : new Error(String(error)));
  }
}

function checkIsMain(): boolean {
  const scriptArg = process.argv[1];
  if (!scriptArg) return false;

  const modulePath = fileURLToPath(import.meta.url);
  try {
    return sameScript(realpathSync(scriptArg), realpathSync(modulePath));
  } catch {
    return sameScript(scriptArg, modulePath);
  }
}

function sameScript(scriptPath: string, modulePath: string): boolean {
  const script = normalizeScriptPath(scriptPath);
  const module = normalizeScriptPath(modulePath);
  return module === script || module.endsWith(script);
}

function normalizeScriptPath(value: string): string {
  return path.normalize(value).replace(/\.[tj]s$/, "").toLowerCase();
}

const isMain = checkIsMain();

if (isMain) {
  try {
    startServer();
  } catch (error) {
    logger.error({ error }, "Fatal server startup error");
    process.exit(1);
  }
}
