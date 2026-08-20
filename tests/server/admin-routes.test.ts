import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerAdminRoutes } from "../../src/server/admin-routes.js";

vi.mock("../../src/core/control-plane-config.js", () => ({
  tryLoadControlPlaneConfig: vi.fn()
}));

vi.mock("../../src/core/control-plane-db.js", () => ({
  getControlPlanePool: vi.fn().mockReturnValue({})
}));

vi.mock("../../src/core/channel-bundle-repository.js", () => ({
  ChannelBundleRepository: vi.fn().mockImplementation(function() { return {}; })
}));

vi.mock("../../src/core/managed-run-repository.js", () => ({
  ManagedRunRepository: vi.fn().mockImplementation(function() { return {}; })
}));

vi.mock("../../src/core/secret-store.js", () => ({
  createSecretStore: vi.fn().mockReturnValue({})
}));

vi.mock("../../src/core/channel-config-resolver.js", () => ({
  ChannelConfigResolver: vi.fn().mockImplementation(function() { return {}; })
}));

vi.mock("../../src/server/auth-middleware.js", () => ({
  createAdminAuthMiddleware: vi.fn().mockReturnValue((c: any, next: any) => next())
}));

vi.mock("../../src/server/admin-channel-routes.js", () => ({
  registerChannelRoutes: vi.fn()
}));

vi.mock("../../src/server/admin-oauth-routes.js", () => ({
  registerYouTubeOAuthRoutes: vi.fn()
}));

vi.mock("../../src/server/admin-run-routes.js", () => ({
  registerRunRoutes: vi.fn()
}));

describe("Admin Routes", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    vi.clearAllMocks();
  });

  it("registers routes when config is present", async () => {
    const { tryLoadControlPlaneConfig } = await import("../../src/core/control-plane-config.js");
    vi.mocked(tryLoadControlPlaneConfig).mockReturnValue({
      databaseUrl: "pg",
      encryptionKey: "key",
      adminApiKey: "key",
      allowedOrigins: ["*"]
    } as any);

    registerAdminRoutes(app);

    const res = await app.request("/api/admin/dummy");
    expect(res.status).toBe(404); // the route itself is not mocked, but the router is mounted

    const { registerChannelRoutes } = await import("../../src/server/admin-channel-routes.js");
    expect(registerChannelRoutes).toHaveBeenCalled();
  });

  it("does not register routes when config is missing", async () => {
    const { tryLoadControlPlaneConfig } = await import("../../src/core/control-plane-config.js");
    vi.mocked(tryLoadControlPlaneConfig).mockReturnValue(null);

    registerAdminRoutes(app);

    const { registerChannelRoutes } = await import("../../src/server/admin-channel-routes.js");
    expect(registerChannelRoutes).not.toHaveBeenCalled();
  });
});
