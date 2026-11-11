

import { Hono } from "hono";
import { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import { ChannelConfigResolver } from "../core/channel-config-resolver.js";
import { tryLoadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { logger } from "../core/logger.js";
import { ManagedRunRepository } from "../core/managed-run-repository.js";
import { createSecretStore } from "../core/secret-store.js";
import { createAdminAuthMiddleware } from "./auth-middleware.js";
import type { AdminDeps } from "./admin-helpers.js";
import { registerChannelRoutes } from "./admin-channel-routes.js";
import { registerYouTubeAuthUrlRoute } from "./admin-oauth-routes.js";
import { registerYouTubeOAuthCallbackRoute } from "./admin-oauth-callback-routes.js";
import { registerRunRoutes } from "./admin-run-routes.js";
import { registerCutRoutes } from "./admin-cut-routes.js";
import { registerScheduleRoutes } from "./admin-schedule-routes.js";
import { ChannelCutsRepository } from "../core/channel-cuts-repository.js";
import { ChannelScheduleRepository } from "../core/channel-schedule-repository.js";
import { ChannelAnalysisRepository } from "../core/channel-analysis-repository.js";

export function registerAdminRoutes(app: Hono): void {
  const config = tryLoadControlPlaneConfig();
  if (!config) {
    return;
  }

  const db = getControlPlanePool(config);
  const repository = new ChannelBundleRepository(db);
  const runRepository = new ManagedRunRepository(db);
  const secretStore = createSecretStore(config);
  const resolver = new ChannelConfigResolver(repository, secretStore);

  const cutsRepository = new ChannelCutsRepository(db);
  const scheduleRepository = new ChannelScheduleRepository(db);
  const analysisRepository = new ChannelAnalysisRepository(db);

  const deps: AdminDeps = { repository, runRepository, secretStore, resolver, cutsRepository, scheduleRepository, analysisRepository };

  // Public: Google redirects the browser here with no Authorization header and
  // no Origin, so it must be mounted without the admin auth middleware.
  const publicOAuth = new Hono();
  registerYouTubeOAuthCallbackRoute(publicOAuth, deps);
  app.route("/api/admin", publicOAuth);

  const admin = new Hono();
  admin.use("/*", createAdminAuthMiddleware(config));

  registerChannelRoutes(admin, deps);
  registerYouTubeAuthUrlRoute(admin, deps);
  registerRunRoutes(admin, deps);
  registerCutRoutes(admin, deps);
  registerScheduleRoutes(admin, deps);

  app.route("/api/admin", admin);
  logger.info({ allowedOrigins: config.allowedOrigins }, "Protected admin routes registered");
}



