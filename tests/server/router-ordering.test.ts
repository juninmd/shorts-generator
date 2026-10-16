import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/core/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  tryLoadControlPlaneConfig: vi.fn(),
  getControlPlanePool: vi.fn(),
  buildDashboardData: vi.fn(),
}));

vi.mock("../../src/core/control-plane-config.js", () => ({
  tryLoadControlPlaneConfig: mocks.tryLoadControlPlaneConfig,
  loadControlPlaneConfig: mocks.tryLoadControlPlaneConfig,
}));
vi.mock("../../src/core/control-plane-db.js", () => ({
  getControlPlanePool: mocks.getControlPlanePool,
  queryRows: vi.fn().mockResolvedValue([]),
  withTransaction: vi.fn(),
}));
vi.mock("../../src/core/feedback/dashboard-service.js", () => ({
  buildDashboardData: mocks.buildDashboardData,
}));

const config = {
  adminToken: "secret-token",
  allowedOrigins: ["http://localhost:5173"],
  databaseUrl: "postgres://example",
  encryptionKey: Buffer.alloc(32, 7),
  encryptionKeyVersion: "v1",
};

describe("router ordering: dashboard link-auth must not shadow other routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getControlPlanePool.mockReturnValue({});
    mocks.tryLoadControlPlaneConfig.mockReturnValue(config);
  });

  it("does not 401 the YouTube OAuth callback registered after the dashboard", async () => {
    const { registerDashboardRoutes } = await import("../../src/server/dashboard-routes.js");
    const { registerYoutubeOAuthRoutes } = await import("../../src/server/youtube-oauth-routes.js");

    // Mirrors src/server/routes.ts: dashboard is registered before the YouTube
    // OAuth callback.
    const app = new Hono();
    registerDashboardRoutes(app);
    registerYoutubeOAuthRoutes(app);

    const res = await app.request("/api/youtube/callback");

    // The callback is public (Google redirects the browser here). It must reach
    // its own handler (400 "Missing code or state") and never the dashboard's
    // link-auth middleware (401).
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing code or state");
  });

  it("still protects the dashboard data route", async () => {
    const { registerDashboardRoutes } = await import("../../src/server/dashboard-routes.js");

    const app = new Hono();
    registerDashboardRoutes(app);

    const unauth = await app.request("/api/dashboard/data");
    expect(unauth.status).toBe(401);

    mocks.buildDashboardData.mockResolvedValue({ generatedAt: "now", channels: [] });
    const auth = await app.request("/api/dashboard/data?token=secret-token");
    expect(auth.status).toBe(200);
  });

  it("still protects the dashboard SPA route", async () => {
    const { registerDashboardRoutes } = await import("../../src/server/dashboard-routes.js");

    const app = new Hono();
    registerDashboardRoutes(app);

    const unauth = await app.request("/dashboard");
    expect(unauth.status).toBe(401);
  });

  it("does not block the admin OAuth callback with the admin auth middleware", async () => {
    const { registerYouTubeOAuthCallbackRoute } = await import("../../src/server/admin-oauth-callback-routes.js");
    const { createAdminAuthMiddleware } = await import("../../src/server/auth-middleware.js");

    const deps = {
      repository: { getBundle: vi.fn().mockResolvedValue(null) },
      secretStore: {},
      resolver: {},
    } as never;

    const app = new Hono();

    // Mirrors src/server/admin-routes.ts: the callback is mounted publicly ...
    const publicOAuth = new Hono();
    registerYouTubeOAuthCallbackRoute(publicOAuth, deps);
    app.route("/api/admin", publicOAuth);

    // ... while the rest of the admin API stays guarded.
    const admin = new Hono();
    admin.use("/*", createAdminAuthMiddleware(config));
    admin.get("/channels", (c) => c.json({ ok: true }));
    app.route("/api/admin", admin);

    // Google redirects here with no Authorization header and no Origin.
    const callback = await app.request("/api/admin/oauth/callback?code=x&state=e30");
    expect(callback.status).toBe(404);

    const guarded = await app.request("/api/admin/channels");
    expect([401, 403]).toContain(guarded.status);
  });
});
