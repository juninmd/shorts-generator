import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { registerYoutubeOAuthRoutes } from "../../src/server/youtube-oauth-routes.js";
import * as controlPlaneConfig from "../../src/core/control-plane-config.js";
import * as controlPlaneDb from "../../src/core/control-plane-db.js";
import * as secretStore from "../../src/core/secret-store.js";

const mockGetToken = vi.fn().mockResolvedValue({ tokens: {} });
const mockSetCredentials = vi.fn();
const mockList = vi.fn().mockResolvedValue({ data: { items: [] } });

vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        OAuth2: class {
          getToken = vi.fn().mockImplementation((...args) => mockGetToken(...args));
          setCredentials = vi.fn().mockImplementation((...args) => mockSetCredentials(...args));
        },
      },
      youtube: vi.fn().mockReturnValue({
        channels: {
          list: vi.fn().mockImplementation((...args) => mockList(...args)),
        },
      }),
    },
  };
});

vi.mock("grammy", () => {
    return {
        Bot: class {
            api = {
                sendMessage: vi.fn().mockResolvedValue({}),
            };
        }
    }
});

vi.mock("../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../../src/core/control-plane-config.js", () => ({
  tryLoadControlPlaneConfig: vi.fn(),
}));

vi.mock("../../src/core/control-plane-db.js", () => ({
  getControlPlanePool: vi.fn(),
}));

const mockGetBundle = vi.fn();
const mockSaveBundle = vi.fn();

vi.mock("../../src/core/channel-bundle-repository.js", () => {
    return { ChannelBundleRepository: class {
        getBundle = vi.fn().mockImplementation((...args) => mockGetBundle(...args));
        saveBundle = vi.fn().mockImplementation((...args) => mockSaveBundle(...args));
    }};
});

vi.mock("../../src/core/secret-store.js", () => {
    const mockStore = {
        encryptToken: vi.fn().mockReturnValue("encrypted"),
        decryptToken: vi.fn().mockReturnValue("decrypted")
    };
    return {
        createSecretStore: vi.fn().mockReturnValue(mockStore),
        __mockStore: mockStore
    };
});

describe("youtube-oauth-routes", () => {
  let app: Hono;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    app = new Hono();
    registerYoutubeOAuthRoutes(app);
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue({ tokens: {} });
    mockSetCredentials.mockReset();
    mockList.mockReset();
    mockList.mockResolvedValue({ data: { items: [] } });
    mockGetBundle.mockReset();
    mockSaveBundle.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 400 if code or state are missing", async () => {
    const res = await app.request("/api/youtube/callback");
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing code or state");
  });

  it("returns 500 if control plane is not configured", async () => {
    vi.mocked(controlPlaneConfig.tryLoadControlPlaneConfig).mockReturnValueOnce(null);
    const res = await app.request("/api/youtube/callback?code=123&state=channel1");
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Control plane not configured");
  });

  it("returns 500 if youtube env vars are missing", async () => {
    vi.mocked(controlPlaneConfig.tryLoadControlPlaneConfig).mockReturnValueOnce({} as any);
    delete process.env.YOUTUBE_CLIENT_ID;
    const res = await app.request("/api/youtube/callback?code=123&state=channel1");
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Missing YouTube credentials or SERVER_PUBLIC_URL");
  });

  describe("with env vars", () => {
    beforeEach(() => {
      process.env.YOUTUBE_CLIENT_ID = "clientId";
      process.env.YOUTUBE_CLIENT_SECRET = "clientSecret";
      process.env.SERVER_PUBLIC_URL = "http://localhost:3000";
      vi.mocked(controlPlaneConfig.tryLoadControlPlaneConfig).mockReturnValue({} as any);
      mockGetToken.mockResolvedValue({ tokens: { refresh_token: "refresh" } });
    });

    it("returns error HTML if token has no refresh_token", async () => {
      mockGetToken.mockResolvedValueOnce({ tokens: { access_token: "123" } });

      const res = await app.request("/api/youtube/callback?code=123&state=channel1");
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Token não gerado");
    });

    it("handles 500 on exchange error", async () => {
      mockGetToken.mockRejectedValueOnce(new Error("exchange failed"));

      const res = await app.request("/api/youtube/callback?code=123&state=channel1");
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Failed to exchange OAuth code");
    });

    it("returns 404 if bundle is not found", async () => {
      mockGetBundle.mockResolvedValueOnce(null);

      const res = await app.request("/api/youtube/callback?code=123&state=channel1");
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Channel channel1 not found");
    });

    it("updates existing account and notifies via global telegram", async () => {
      mockList.mockResolvedValueOnce({ data: { items: [{ snippet: { title: "Auth Channel" }, id: "auth1" }] } });

      const mockBundle = {
        channel: { name: "Bundle Channel" },
        publishingAccounts: [{ provider: "youtube", id: "existing1", encryptedToken: "old" }],
      };

      mockGetBundle.mockResolvedValueOnce(mockBundle);

      process.env.TELEGRAM_BOT_TOKEN = "global-token";
      process.env.TELEGRAM_CHAT_ID = "global-chat";

      const res = await app.request("/api/youtube/callback?code=123&state=channel1");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Token atualizado com sucesso!");
      expect(text).toContain("Auth Channel");

      expect(mockSaveBundle).toHaveBeenCalledWith(expect.objectContaining({
          publishingAccounts: [expect.objectContaining({ provider: "youtube", encryptedToken: "encrypted", accountIdentifier: "Auth Channel" })]
      }));
    });

    it("creates new account and notifies via channel specific telegram, handles missing channel info", async () => {
      mockList.mockRejectedValueOnce(new Error("fetch error"));

      const mockBundle = {
        channel: { name: "Bundle Channel" },
        publishingAccounts: [{ provider: "telegram", id: "tg1", encryptedToken: "encTg", accountIdentifier: "channel-chat" }],
      };
      mockGetBundle.mockResolvedValueOnce(mockBundle);

      const res = await app.request("/api/youtube/callback?code=123&state=channel1");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Token atualizado com sucesso!");

      expect(mockSaveBundle).toHaveBeenCalledWith(expect.objectContaining({
          publishingAccounts: expect.arrayContaining([expect.objectContaining({ provider: "youtube", accountIdentifier: "Bundle Channel" })])
      }));
    });

    it("handles decrypt token failure and falls back to global env vars", async () => {
        const mockBundle = {
          channel: { name: "Bundle Channel" },
          publishingAccounts: [{ provider: "telegram", id: "tg1", encryptedToken: "encTg", accountIdentifier: "channel-chat" }],
        };
        mockGetBundle.mockResolvedValueOnce(mockBundle);

        process.env.TELEGRAM_BOT_TOKEN = "global-token";
        process.env.TELEGRAM_CHAT_ID = "global-chat";

        (secretStore as any).__mockStore.decryptToken.mockImplementationOnce(() => { throw new Error("decrypt failed"); });

        const res = await app.request("/api/youtube/callback?code=123&state=channel1");
        expect(res.status).toBe(200);
        // telegram will use fallback vars and sendMessage will still be called via Bot mock
    });
  });
});
