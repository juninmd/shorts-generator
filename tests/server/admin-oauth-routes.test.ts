import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerYouTubeOAuthRoutes } from "../../src/server/admin-oauth-routes.js";
import { google } from "googleapis";

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(function() {
        return {
          generateAuthUrl: vi.fn().mockReturnValue("http://auth.url"),
          getToken: vi.fn().mockResolvedValue({ tokens: { refresh_token: "ref_tok" } })
        };
      })
    }
  }
}));

vi.mock("grammy", () => ({
  Bot: vi.fn().mockImplementation(function() {
    return {
      api: {
        sendMessage: vi.fn().mockResolvedValue(true)
      }
    };
  })
}));

describe("Admin OAuth Routes", () => {
  let app: Hono;
  let mockDeps: any;
  let oauthMock: any;

  beforeEach(() => {
    app = new Hono();
    mockDeps = {
      repository: {
        getBundle: vi.fn(),
        updatePublishingAccount: vi.fn()
      },
      secretStore: {
        encryptToken: vi.fn().mockReturnValue("encrypted")
      },
      resolver: {
        resolveRunConfig: vi.fn().mockResolvedValue({
          telegramAccount: { token: "tok", accountIdentifier: "chat" },
          channel: { name: "test channel" }
        })
      }
    };
    registerYouTubeOAuthRoutes(app, mockDeps);
  });

  it("GET /channels/:channelId/youtube/auth-url returns 404 if channel not found", async () => {
    mockDeps.repository.getBundle.mockResolvedValue(null);
    const res = await app.request("/channels/test/youtube/auth-url");
    expect(res.status).toBe(404);
  });

  it("GET /channels/:channelId/youtube/auth-url returns 400 if credentials missing", async () => {
    mockDeps.repository.getBundle.mockResolvedValue({
      publishingAccounts: [{ provider: "youtube", id: "acc1" }]
    });
    const res = await app.request("/channels/test/youtube/auth-url");
    expect(res.status).toBe(400);
  });

  it("GET /channels/:channelId/youtube/auth-url generates URL successfully", async () => {
    mockDeps.repository.getBundle.mockResolvedValue({
      publishingAccounts: [{ provider: "youtube", id: "acc1", clientId: "cid", clientSecret: "csec" }]
    });
    const res = await app.request("/channels/test/youtube/auth-url");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.authUrl).toBe("http://auth.url");
  });

  it("GET /oauth/callback returns 400 on error query param", async () => {
    const res = await app.request("/oauth/callback?error=denied");
    expect(res.status).toBe(400);
  });

  it("GET /oauth/callback returns 400 on missing code or state", async () => {
    const res = await app.request("/oauth/callback");
    expect(res.status).toBe(400);
  });

  it("GET /oauth/callback returns 400 on invalid state", async () => {
    const res = await app.request("/oauth/callback?code=abc&state=invalid");
    expect(res.status).toBe(400);
  });

  it("GET /oauth/callback returns 404 if channel not found", async () => {
    const state = Buffer.from(JSON.stringify({ channelId: "c1", accountId: "a1", redirectUri: "r1" })).toString("base64url");
    mockDeps.repository.getBundle.mockResolvedValue(null);
    const res = await app.request(`/oauth/callback?code=abc&state=${state}`);
    expect(res.status).toBe(404);
  });

  it("GET /oauth/callback returns 404 if account not found or missing credentials", async () => {
    const state = Buffer.from(JSON.stringify({ channelId: "c1", accountId: "a1", redirectUri: "r1" })).toString("base64url");
    mockDeps.repository.getBundle.mockResolvedValue({
      publishingAccounts: [{ id: "a2", provider: "youtube" }]
    });
    const res = await app.request(`/oauth/callback?code=abc&state=${state}`);
    expect(res.status).toBe(404);
  });

  it("GET /oauth/callback returns 400 if no refresh token", async () => {
    // Override getToken to return no refresh token
    (google.auth.OAuth2 as any) = vi.fn().mockImplementation(function() {
      return {
        getToken: vi.fn().mockResolvedValue({ tokens: { access_token: "acc" } })
      };
    });

    const state = Buffer.from(JSON.stringify({ channelId: "c1", accountId: "a1", redirectUri: "r1" })).toString("base64url");
    mockDeps.repository.getBundle.mockResolvedValue({
      channel: { name: "test" },
      publishingAccounts: [{ id: "a1", provider: "youtube", clientId: "c", clientSecret: "s" }]
    });
    const res = await app.request(`/oauth/callback?code=abc&state=${state}`);
    expect(res.status).toBe(400);

    // Restore mock for other tests if needed
    (google.auth.OAuth2 as any) = vi.fn().mockImplementation(function() {
      return {
        generateAuthUrl: vi.fn().mockReturnValue("http://auth.url"),
        getToken: vi.fn().mockResolvedValue({ tokens: { refresh_token: "ref_tok" } })
      };
    });
  });

  it("GET /oauth/callback processes successfully", async () => {
    const state = Buffer.from(JSON.stringify({ channelId: "c1", accountId: "a1", redirectUri: "r1" })).toString("base64url");
    mockDeps.repository.getBundle.mockResolvedValue({
      channel: { name: "test" },
      publishingAccounts: [{ id: "a1", provider: "youtube", clientId: "c", clientSecret: "s", label: "My Acc" }]
    });
    const res = await app.request(`/oauth/callback?code=abc&state=${state}`);
    expect(res.status).toBe(200);
    expect(mockDeps.repository.updatePublishingAccount).toHaveBeenCalled();
  });

  it("GET /oauth/callback catches telegram notification failure but still succeeds", async () => {
    const state = Buffer.from(JSON.stringify({ channelId: "c1", accountId: "a1", redirectUri: "r1" })).toString("base64url");
    mockDeps.repository.getBundle.mockResolvedValue({
      channel: { name: "test" },
      publishingAccounts: [{ id: "a1", provider: "youtube", clientId: "c", clientSecret: "s", label: "My Acc" }]
    });
    mockDeps.resolver.resolveRunConfig.mockRejectedValue(new Error("notify fail"));

    const res = await app.request(`/oauth/callback?code=abc&state=${state}`);
    expect(res.status).toBe(200);
    expect(mockDeps.repository.updatePublishingAccount).toHaveBeenCalled();
  });

  it("GET /channels/:channelId/youtube/auth-url returns 500 on unexpected error", async () => {
    mockDeps.repository.getBundle.mockRejectedValue(new Error("db error"));
    const res = await app.request("/channels/test/youtube/auth-url");
    expect(res.status).toBe(500);
  });

  it("GET /channels/:channelId/youtube/auth-url uses request query redirect_uri when provided", async () => {
    mockDeps.repository.getBundle.mockResolvedValue({
      publishingAccounts: [{ provider: "youtube", id: "acc1", clientId: "cid", clientSecret: "csec" }]
    });
    const res = await app.request("/channels/test/youtube/auth-url?redirect_uri=http://custom");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.authUrl).toBe("http://auth.url");
  });

  it("GET /oauth/callback returns 400 if state parameter is invalid json", async () => {
    const invalidState = Buffer.from("{invalid json}").toString("base64url");
    const res = await app.request(`/oauth/callback?code=abc&state=${invalidState}`);
    expect(res.status).toBe(400);
  });

  it("GET /oauth/callback returns 500 when string error is thrown", async () => {
    mockDeps.repository.getBundle.mockRejectedValue("string error");
    const state = Buffer.from(JSON.stringify({ channelId: "c1", accountId: "a1", redirectUri: "r1" })).toString("base64url");
    const res = await app.request(`/oauth/callback?code=abc&state=${state}`);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("Authentication failed: string error");
  });

  it("GET /oauth/callback processes successfully even when telegram isn't configured", async () => {
    const state = Buffer.from(JSON.stringify({ channelId: "c1", accountId: "a1", redirectUri: "r1" })).toString("base64url");
    mockDeps.repository.getBundle.mockResolvedValue({
      channel: { name: "test" },
      publishingAccounts: [{ id: "a1", provider: "youtube", clientId: "c", clientSecret: "s", label: "My Acc" }]
    });
    mockDeps.resolver.resolveRunConfig.mockResolvedValue({
      telegramAccount: null,
      channel: { name: "test channel" }
    });
    const res = await app.request(`/oauth/callback?code=abc&state=${state}`);
    expect(res.status).toBe(200);
  });

  it("GET /oauth/callback returns 500 when Error object is thrown", async () => {
    mockDeps.repository.getBundle.mockRejectedValue(new Error("object error"));
    const state = Buffer.from(JSON.stringify({ channelId: "c1", accountId: "a1", redirectUri: "r1" })).toString("base64url");
    const res = await app.request(`/oauth/callback?code=abc&state=${state}`);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("Authentication failed: object error");
  });
});
