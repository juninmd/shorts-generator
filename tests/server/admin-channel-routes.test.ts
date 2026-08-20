import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerChannelRoutes } from "../../src/server/admin-channel-routes.js";
import { google } from "googleapis";

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(function() {
        return {
          setCredentials: vi.fn(),
          getAccessToken: vi.fn().mockResolvedValue({ token: "test" })
        };
      })
    }
  }
}));

describe("Admin Channel Routes", () => {
  let app: Hono;
  let mockDeps: any;

  beforeEach(() => {
    app = new Hono();
    mockDeps = {
      repository: {
        listBundles: vi.fn().mockResolvedValue([]),
        getBundle: vi.fn(),
        saveBundle: vi.fn(),
        deleteBundle: vi.fn()
      },
      secretStore: {
        encryptToken: vi.fn().mockReturnValue("encrypted")
      },
      resolver: {
        resolveRunConfig: vi.fn().mockResolvedValue({
          publishingAccount: { clientId: "id", clientSecret: "secret", token: "tok" }
        })
      }
    };
    registerChannelRoutes(app, mockDeps);
  });

  it("GET /channels returns list", async () => {
    const res = await app.request("/channels");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("GET /channels/:channelId returns bundle if exists", async () => {
    mockDeps.repository.getBundle.mockResolvedValue({
      channel: { id: "test" },
      profile: {},
      focuses: [],
      sources: [],
      publishingAccounts: []
    });
    const res = await app.request("/channels/test");
    expect(res.status).toBe(200);
  });

  it("GET /channels/:channelId returns 404 if missing", async () => {
    mockDeps.repository.getBundle.mockResolvedValue(null);
    const res = await app.request("/channels/test");
    expect(res.status).toBe(404);
  });

  it("PUT /channels/:channelId validates input", async () => {
    const res = await app.request("/channels/test", {
      method: "PUT",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" }
    });
    expect(res.status).toBe(400);
  });

  it("PUT /channels/:channelId fails for quiz when mode is cuts", async () => {
    process.env.CHANNEL_FLOW_MODE = "cuts";
    mockDeps.repository.getBundle.mockResolvedValue(null);
    const validPayload = {
      slug: "test-slug",
      name: "Test Name",
      description: "Test Desc",
      status: "active",
      watermarkText: "Test Watermark",
      channelType: "quiz",
      profile: {
        videoLimit: 10,
        minShortDuration: 15,
        maxShortDuration: 60,
        sortByViews: true,
        aiProvider: "ollama",
        aiModel: "gemma"
      },
      focuses: [],
      sources: [],
      publishingAccounts: []
    };
    const res = await app.request("/channels/test", {
      method: "PUT",
      body: JSON.stringify(validPayload),
      headers: { "Content-Type": "application/json" }
    });
    expect(res.status).toBe(409);
    process.env.CHANNEL_FLOW_MODE = "";
  });

  it("PUT /channels/:channelId creates successfully", async () => {
    mockDeps.repository.getBundle.mockResolvedValue(null);
    const validPayload = {
      slug: "test-slug",
      name: "Test Name",
      description: "Test Desc",
      status: "active",
      watermarkText: "Test Watermark",
      channelType: "cuts",
      profile: {
        videoLimit: 10,
        minShortDuration: 15,
        maxShortDuration: 60,
        sortByViews: true,
        aiProvider: "ollama",
        aiModel: "gemma"
      },
      focuses: [{ key: "tecnologia", label: "Tech" }],
      sources: [{ kind: "youtube_url", value: "x", label: "x" }],
      publishingAccounts: [{ provider: "youtube", label: "x", status: "active", accountIdentifier: "x", refreshToken: "ref" }]
    };
    const res = await app.request("/channels/test", {
      method: "PUT",
      body: JSON.stringify(validPayload),
      headers: { "Content-Type": "application/json" }
    });
    expect(res.status).toBe(200);
    expect(mockDeps.repository.saveBundle).toHaveBeenCalled();
  });

  it("PUT /channels/:channelId updates existing correctly", async () => {
    mockDeps.repository.getBundle.mockResolvedValue({
      channel: { createdAt: "old" },
      publishingAccounts: []
    });
    const validPayload = {
      slug: "test-slug",
      name: "Test Name",
      description: "Test Desc",
      status: "active",
      watermarkText: "Test Watermark",
      channelType: "cuts",
      profile: {
        videoLimit: 10,
        minShortDuration: 15,
        maxShortDuration: 60,
        sortByViews: true,
        aiProvider: "ollama",
        aiModel: "gemma"
      },
      focuses: [],
      sources: [],
      publishingAccounts: []
    };
    const res = await app.request("/channels/test", {
      method: "PUT",
      body: JSON.stringify(validPayload),
      headers: { "Content-Type": "application/json" }
    });
    expect(res.status).toBe(200);
    expect(mockDeps.repository.saveBundle).toHaveBeenCalled();
  });

  it("DELETE /channels/:channelId works", async () => {
    const res = await app.request("/channels/test", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(mockDeps.repository.deleteBundle).toHaveBeenCalledWith("test");
  });

  it("POST /channels/:channelId/test-connection works", async () => {
    const res = await app.request("/channels/test/test-connection", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("POST /channels/:channelId/test-connection fails on error", async () => {
    mockDeps.resolver.resolveRunConfig.mockRejectedValue(new Error("fail"));
    const res = await app.request("/channels/test/test-connection", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("POST /channels/:channelId/test-connection fails when getAccessToken throws", async () => {
    mockDeps.resolver.resolveRunConfig.mockResolvedValueOnce({
      publishingAccount: { clientId: "id", clientSecret: "secret", token: "tok" }
    });

    // Override getAccessToken to throw
    (google.auth.OAuth2 as any).mockImplementationOnce(function() {
      return {
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockRejectedValue(new Error("token error"))
      };
    });

    const res = await app.request("/channels/test/test-connection", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("POST /channels/:channelId/test-connection handles missing client credentials gracefully", async () => {
    mockDeps.resolver.resolveRunConfig.mockResolvedValueOnce({
      publishingAccount: { clientId: null, clientSecret: null, token: "tok" }
    });
    const res = await app.request("/channels/test/test-connection", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
