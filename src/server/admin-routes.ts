

import { Hono } from "hono";
import { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import { ChannelConfigResolver } from "../core/channel-config-resolver.js";
import { tryLoadControlPlaneConfig } from "../core/control-plane-config.js";
import { getControlPlanePool } from "../core/control-plane-db.js";
import { logger } from "../core/logger.js";
import { DurableRunRepository } from "../core/runs/durable-run-repository.js";
import { enqueueRun } from "../core/runs/run-queue.js";
import { PublicationRepository } from "../core/publication/publication-repository.js";
import { enqueuePublication, enqueueRegeneration } from "../core/publication/publication-queue.js";
import { QuizBankRepository } from "../core/quiz/quiz-bank-repository.js";
import { registerReviewRoutes } from "./admin-review-routes.js";
import { adminErrorHandler, registerQualityRoutes } from "./admin-quality-routes.js";
import { createSecretStore } from "../core/secret-store.js";
import { createAdminAuthMiddleware } from "./auth-middleware.js";
import type { AdminDeps } from "./admin-helpers.js";
import { registerChannelRoutes } from "./admin-channel-routes.js";
import { registerYouTubeOAuthRoutes } from "./admin-oauth-routes.js";
import { registerRunRoutes } from "./admin-run-routes.js";

export function registerAdminRoutes(app: Hono): void {
  const config = tryLoadControlPlaneConfig();
  if (!config) {
    return;
  }

  const admin = new Hono();
  const db = getControlPlanePool(config);
  const repository = new ChannelBundleRepository(db);
  const runRepository = new DurableRunRepository(db);
  const secretStore = createSecretStore(config);
  const resolver = new ChannelConfigResolver(repository, secretStore);

  const deps: AdminDeps = {
    repository, runRepository, secretStore, resolver,
    publications: new PublicationRepository(db), quizBank: new QuizBankRepository(db), decisionsDb: db,
    enqueueRun: (data, attempt) => enqueueRun(data, attempt),
    enqueuePublication: (data) => enqueuePublication(data),
    enqueueRegeneration: (data) => enqueueRegeneration(data),
  };

  admin.use("/*", createAdminAuthMiddleware(config));
  admin.onError(adminErrorHandler);

  registerChannelRoutes(admin, deps);
  registerYouTubeOAuthRoutes(admin, deps);
  registerRunRoutes(admin, deps);
  registerReviewRoutes(admin, deps);
  registerQualityRoutes(admin, deps);

  app.route("/api/admin", admin);
  logger.info({ allowedOrigins: config.allowedOrigins }, "Protected admin routes registered");
}



