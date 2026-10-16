import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { tryLoadControlPlaneConfig, type ControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { buildDashboardData } from "../core/feedback/dashboard-service.js";
import { logger } from "../core/logger.js";
import { createLinkAuthMiddleware } from "./auth-middleware.js";

/** Mirrors registerAdminRoutes: no-op when the control plane isn't configured (e.g. local generate-only mode). */
export function registerDashboardRoutes(app: Hono): void {
  const config = tryLoadControlPlaneConfig();
  if (!config) return;
  registerDashboardRoutesWith(app, config);
}

/**
 * Read-only routes for the metrics dashboard. Mounted separately from
 * /api/admin/* because it accepts a query-string token (needed for the link
 * shared via Telegram, which cannot send an Authorization header).
 */
function registerDashboardRoutesWith(app: Hono, config: ControlPlaneConfig): void {
  const dashboard = new Hono();
  const requireLinkToken = createLinkAuthMiddleware(config);

  // Scope the link-auth middleware to the dashboard's own paths. A bare
  // use("/*") on an app mounted at "/" also intercepts every route registered
  // afterwards (e.g. /api/youtube/callback), turning them into 401s.
  dashboard.use("/api/dashboard/*", requireLinkToken);

  dashboard.get("/api/dashboard/data", async (c) => {
    try {
      const db = getControlPlanePool(config);
      const data = await buildDashboardData(db);
      return c.json(data);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "dashboard-routes: failed to build data");
      return c.json({ error: "Failed to load dashboard data" }, 500);
    }
  });

  // Serves the built SPA so the same link works standalone (not just from the admin console).
  dashboard.get("/dashboard", requireLinkToken, (c) => {
    const indexPath = path.resolve("web/dist/index.html");
    if (!fs.existsSync(indexPath)) {
      return c.json({ error: "Web build not found. Run `pnpm web:build` first." }, 404);
    }
    return c.html(fs.readFileSync(indexPath, "utf8"));
  });

  app.route("/", dashboard);
}
