import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repositoryState = {
  bundle: {
    channel: {
      id: "canal-1",
      slug: "canal-1",
      name: "Canal 1",
      description: "desc",
      status: "active",
      logoPath: null,
      watermarkText: "Canal 1",
      channelType: "cuts" as const,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    profile: {
      channelId: "canal-1",
      videoLimit: 3,
      minShortDuration: 15,
      maxShortDuration: 59,
      targetShorts: 3,
      videoQuery: null,
      sortByViews: false,
      aiProvider: "ollama" as const,
      aiModel: "gemma3:1b",
    },
    focuses: [{ id: "f1", key: "catolicos" as const, label: "Católicos" }],
    sources: [{ id: "s1", kind: "youtube_channel" as const, value: "UC123", label: "Fonte", createdAt: "2024-01-01T00:00:00.000Z" }],
    publishingAccounts: [] as any[],
  },
};

const runState = {
  run: null as any,
};

vi.mock("../../src/core/control-plane-db.js", () => ({
  getControlPlanePool: vi.fn(() => ({ query: vi.fn() })),
}));

vi.mock("../../src/core/channel-bundle-repository.js", () => ({
  ChannelBundleRepository: class {
    async listBundles() { return [repositoryState.bundle]; }
    async getBundle(channelId: string) { return channelId === repositoryState.bundle.channel.id ? repositoryState.bundle : null; }
    async saveBundle(bundle: typeof repositoryState.bundle) { repositoryState.bundle = bundle; }
    async deleteBundle() { repositoryState.bundle = null as any; }
  },
}));

vi.mock("../../src/core/managed-run-repository.js", () => ({
  ManagedRunRepository: class {
    async createRun() {}
    async updateProgress() {}
    async completeRun() {}
    async failRun() {}
    async listRuns() { return []; }
    async getRun() { return runState.run; }
  },
}));

vi.mock("../../src/core/secret-store.js", () => ({
  createSecretStore: () => ({
    encryptToken: vi.fn(() => ({ keyVersion: "v1", iv: "iv", authTag: "tag", ciphertext: "cipher" })),
    decryptToken: vi.fn(() => "refresh-token"),
  }),
}));

vi.mock("../../src/core/channel-config-resolver.js", () => ({
  ChannelConfigResolver: class {
    async resolveRunConfig() {
      return {
        channel: repositoryState.bundle.channel,
        profile: repositoryState.bundle.profile,
        focuses: repositoryState.bundle.focuses,
        sources: repositoryState.bundle.sources,
        publishingAccount: {
          provider: "youtube",
          accountId: "acc1",
          channelId: repositoryState.bundle.channel.id,
          accountIdentifier: "channel@example.com",
          token: "refresh-token",
          clientId: "client-id",
          clientSecret: "client-secret",
        },
        snapshotCreatedAt: "2024-01-01T00:00:00.000Z",
      };
    }
  },
  buildManagedPipelineConfig: vi.fn(() => ({ channels: [], specificUrls: [] })),
}));

vi.mock("../../src/core/pipeline.js", () => ({
  runPipeline: vi.fn(async () => []),
}));

describe("admin routes", () => {
  const originalEnv = process.env;

  const initialBundle = JSON.parse(JSON.stringify(repositoryState.bundle));
  beforeEach(() => {
    repositoryState.bundle = JSON.parse(JSON.stringify(initialBundle));
    vi.resetModules();
    process.env = {
      ...originalEnv,
      ADMIN_API_TOKEN: "secret-token",
      ADMIN_ALLOWED_ORIGINS: "http://localhost:5173",
      DATABASE_URL: "postgres://local:test@localhost:5432/shorts",
      CONTROL_PLANE_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    };
    delete process.env.CHANNEL_FLOW_MODE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects unauthenticated requests", async () => {
    const { registerAdminRoutes } = await import("../../src/server/admin-routes.js");
    const app = new Hono();
    registerAdminRoutes(app);

    const response = await app.request("/api/admin/channels", { headers: { Origin: "http://localhost:5173" } });
    expect(response.status).toBe(401);
  });

  it("lists channels for authenticated requests", async () => {
    const { registerAdminRoutes } = await import("../../src/server/admin-routes.js");
    const app = new Hono();
    registerAdminRoutes(app);

    const response = await app.request("/api/admin/channels", {
      headers: {
        Origin: "http://localhost:5173",
        Authorization: "Bearer secret-token",
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].channel.id).toBe("canal-1");
  });

  async function makeAuthedRequest(path: string, method = "GET", body?: unknown) {
    const { registerAdminRoutes } = await import("../../src/server/admin-routes.js");
    const app = new Hono();
    registerAdminRoutes(app);
    return app.request(path, {
      method,
      headers: { Origin: "http://localhost:5173", Authorization: "Bearer secret-token", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it("GET /channels/:channelId returns 200 for existing channel", async () => {
    const res = await makeAuthedRequest("/api/admin/channels/canal-1");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.channel.id).toBe("canal-1");
  });

  it("GET /channels/:channelId returns 404 for unknown channel", async () => {
    const res = await makeAuthedRequest("/api/admin/channels/unknown-channel");
    expect(res.status).toBe(404);
  });

  it("PUT /channels/:channelId updates a channel", async () => {
    const payload = {
      slug: "canal-1", name: "Canal 1 Updated", description: "desc", status: "active",
      watermarkText: "Canal", logoPath: null,
      profile: { videoLimit: 3, minShortDuration: 15, maxShortDuration: 59, aiProvider: "ollama", aiModel: "gemma3:1b", sortByViews: false },
      focuses: [{ key: "catolicos", label: "Católicos" }],
      sources: [{ kind: "youtube_channel", value: "UC123", label: "Fonte" }],
      publishingAccounts: [],
    };
    const res = await makeAuthedRequest("/api/admin/channels/canal-1", "PUT", payload);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe("ok");
  });

  it("PUT /channels/:channelId returns 400 for invalid payload", async () => {
    const res = await makeAuthedRequest("/api/admin/channels/canal-1", "PUT", { invalid: true });
    expect(res.status).toBe(400);
  });

  it("PUT /channels/:channelId rejects quiz channels in cuts-only mode", async () => {
    process.env.CHANNEL_FLOW_MODE = "cuts";
    const payload = {
      slug: "canal-1", name: "Canal 1 Quiz", description: "desc", status: "active",
      watermarkText: "Canal", logoPath: null, channelType: "quiz",
      profile: { videoLimit: 3, minShortDuration: 15, maxShortDuration: 59, aiProvider: "ollama", aiModel: "gemma3:1b", sortByViews: false },
      focuses: [{ key: "catolicos", label: "CatÃ³licos" }],
      sources: [],
      publishingAccounts: [],
    };
    const res = await makeAuthedRequest("/api/admin/channels/canal-1", "PUT", payload);
    expect(res.status).toBe(409);
  });

  it("DELETE /channels/:channelId deletes channel", async () => {
    const res = await makeAuthedRequest("/api/admin/channels/canal-1", "DELETE");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe("deleted");
  });

  it("GET /runs returns run list", async () => {
    const res = await makeAuthedRequest("/api/admin/runs");
    expect(res.status).toBe(200);
  });

  it("GET /runs/:runId returns 404 when run not found", async () => {
    const res = await makeAuthedRequest("/api/admin/runs/nonexistent");
    expect(res.status).toBe(404);
  });

  it("GET /runs/:runId returns 200 for existing run", async () => {
    runState.run = { id: "run-1", status: "completed" };
    const res = await makeAuthedRequest("/api/admin/runs/run-1");
    expect(res.status).toBe(200);
  });

  it("GET /channels includes publishingAccounts array when non-empty", async () => {
    repositoryState.bundle.publishingAccounts = [{
      id: "acc-1", channelId: "canal-1", provider: "youtube", label: "YT",
      status: "active", accountIdentifier: "ch@example.com",
      clientId: "cid", clientSecret: "cs",
      encryptedToken: { keyVersion: "v1", iv: "iv", authTag: "t", ciphertext: "c" },
      createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z",
    }] as any;
    const res = await makeAuthedRequest("/api/admin/channels/canal-1");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.publishingAccounts).toHaveLength(1);
    expect(body.publishingAccounts[0].hasStoredToken).toBe(true);
  });

  it("POST /channels/:channelId/runs creates a run and returns 202", async () => {
    const res = await makeAuthedRequest("/api/admin/channels/canal-1/runs", "POST");
    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.status).toBe("processing");
    expect(typeof body.runId).toBe("string");
  });

  it("POST /channels/:channelId/runs rejects quiz runs in cuts-only mode", async () => {
    process.env.CHANNEL_FLOW_MODE = "cuts";
    repositoryState.bundle.channel.channelType = "quiz" as any;
    const res = await makeAuthedRequest("/api/admin/channels/canal-1/runs", "POST");
    expect(res.status).toBe(409);
  });
});
