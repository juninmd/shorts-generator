import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { mockTryLoadControlPlaneConfig, mockGetControlPlanePool, mockBuildDashboardData, mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockTryLoadControlPlaneConfig: vi.fn(),
  mockGetControlPlanePool: vi.fn(),
  mockBuildDashboardData: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock("../../src/core/control-plane-config.js", () => ({ tryLoadControlPlaneConfig: mockTryLoadControlPlaneConfig }));
vi.mock("../../src/core/control-plane-db.js", () => ({ getControlPlanePool: mockGetControlPlanePool }));
vi.mock("../../src/core/feedback/dashboard-service.js", () => ({ buildDashboardData: mockBuildDashboardData }));
vi.mock("node:fs", () => ({ default: { existsSync: mockExistsSync, readFileSync: mockReadFileSync } }));

const config = {
  adminToken: "secret-token",
  allowedOrigins: ["http://localhost:5173"],
  databaseUrl: "postgres://example",
  encryptionKey: Buffer.alloc(32, 7),
  encryptionKeyVersion: "v1",
} as const;

async function buildApp() {
  const { registerDashboardRoutes } = await import("../../src/server/dashboard-routes.js");
  const app = new Hono();
  registerDashboardRoutes(app);
  return app;
}

describe("registerDashboardRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetControlPlanePool.mockReturnValue({});
  });

  it("mounts nothing when the control plane is not configured", async () => {
    mockTryLoadControlPlaneConfig.mockReturnValue(null);
    const app = await buildApp();
    const res = await app.request("/api/dashboard/data?token=secret-token");
    expect(res.status).toBe(404);
  });

  describe("with control plane configured", () => {
    beforeEach(() => {
      mockTryLoadControlPlaneConfig.mockReturnValue(config);
    });

    it("rejects an unauthenticated request", async () => {
      const app = await buildApp();
      const res = await app.request("/api/dashboard/data");
      expect(res.status).toBe(401);
    });

    it("returns dashboard data for an authenticated request", async () => {
      mockBuildDashboardData.mockResolvedValue({ generatedAt: "2026-09-20T00:00:00Z", channels: [] });
      const app = await buildApp();
      const res = await app.request("/api/dashboard/data?token=secret-token");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ generatedAt: "2026-09-20T00:00:00Z", channels: [] });
    });

    it("returns 500 when building dashboard data fails", async () => {
      mockBuildDashboardData.mockRejectedValue(new Error("db down"));
      const app = await buildApp();
      const res = await app.request("/api/dashboard/data?token=secret-token");
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to load dashboard data" });
    });

    it("returns 500 when a non-Error value is thrown", async () => {
      mockBuildDashboardData.mockRejectedValue("plain string failure");
      const app = await buildApp();
      const res = await app.request("/api/dashboard/data?token=secret-token");
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Failed to load dashboard data" });
    });

    it("serves the built SPA when present", async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("<html>dash</html>");
      const app = await buildApp();
      const res = await app.request("/dashboard?token=secret-token");
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("<html>dash</html>");
    });

    it("returns 404 when the web build is missing", async () => {
      mockExistsSync.mockReturnValue(false);
      const app = await buildApp();
      const res = await app.request("/dashboard?token=secret-token");
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Web build not found. Run `pnpm web:build` first." });
    });
  });
});
