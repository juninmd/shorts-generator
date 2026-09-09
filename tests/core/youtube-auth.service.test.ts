import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateYouTubeToken, getYouTubeAuth } from "../../src/core/youtube-auth.service.js";
import { sendReauthAlert } from "../../src/core/youtube-reauth.js";
import type { PipelineConfig } from "../../src/types.js";

const { mockGetBundle, mockSetCredentials, mockGetAccessToken } = vi.hoisted(() => ({
  mockGetBundle: vi.fn(),
  mockSetCredentials: vi.fn(),
  mockGetAccessToken: vi.fn().mockResolvedValue({ token: "test-token" })
}));

vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        OAuth2: class {
          setCredentials = mockSetCredentials;
          getAccessToken = mockGetAccessToken;
        }
      },
    },
  };
});

vi.mock("../../src/core/channel-bundle-repository.js", () => {
  return {
    ChannelBundleRepository: class {
      getBundle = mockGetBundle;
    }
  };
});

vi.mock("../../src/core/secret-store.js", () => ({
  createSecretStore: vi.fn().mockReturnValue({
    decryptToken: vi.fn().mockReturnValue("mock-refresh-token"),
  }),
}));

vi.mock("../../src/core/control-plane-config.js", () => ({
  loadControlPlaneConfig: vi.fn().mockReturnValue({}),
}));

vi.mock("../../src/core/control-plane-db.js", () => ({
  getControlPlanePool: vi.fn().mockReturnValue({}),
}));

vi.mock("../../src/core/youtube-reauth.js", () => ({
  generateReauthUrl: vi.fn().mockReturnValue("http://reauth"),
  sendReauthAlert: vi.fn(),
}));

describe("youtube-auth.service", () => {
  const mockConfig: PipelineConfig = {
    managedRun: {
      channelId: "test-channel",
      channelName: "Test Channel",
    },
    serverPublicUrl: "http://public",
  } as PipelineConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockReset();
    mockGetAccessToken.mockResolvedValue({ token: "test-token" });

    mockGetBundle.mockReset();
    mockGetBundle.mockResolvedValue({
        publishingAccounts: [
          {
            provider: "youtube",
            channelId: "test-channel",
            id: "id1",
            encryptedToken: "enc1",
            clientId: "client1",
            clientSecret: "secret1",
          },
        ],
    });
  });

  describe("getYouTubeAuth", () => {
    it("should return auth config from db when managedRun exists", async () => {
      const auth = await getYouTubeAuth(mockConfig);
      expect(auth).toEqual({
        clientId: "client1",
        clientSecret: "secret1",
        refreshToken: "mock-refresh-token",
      });
    });

    it("should return null if no youtube account in bundle", async () => {
      mockGetBundle.mockResolvedValueOnce({ publishingAccounts: [] });
      const auth = await getYouTubeAuth(mockConfig);
      expect(auth).toBeNull();
    });

    it("should return null on db error", async () => {
      mockGetBundle.mockRejectedValueOnce(new Error("DB Error"));
      const auth = await getYouTubeAuth(mockConfig);
      expect(auth).toBeNull();
    });

    it("should fallback to env if no managed run", async () => {
      process.env.YOUTUBE_CLIENT_ID = "env-id";
      process.env.YOUTUBE_CLIENT_SECRET = "env-secret";
      process.env.YOUTUBE_REFRESH_TOKEN = "env-token";

      const auth = await getYouTubeAuth({} as PipelineConfig);
      expect(auth).toEqual({
        clientId: "env-id",
        clientSecret: "env-secret",
        refreshToken: "env-token",
      });
    });

    it("should return null if env missing when no managed run", async () => {
        delete process.env.YOUTUBE_CLIENT_ID;
        delete process.env.YOUTUBE_CLIENT_SECRET;
        delete process.env.YOUTUBE_REFRESH_TOKEN;
        const auth = await getYouTubeAuth({} as PipelineConfig);
        expect(auth).toBeNull();
    });

    it("should use config.youtubeAuth if provided", async () => {
        const auth = await getYouTubeAuth({
            youtubeAuth: { clientId: 'cfg1', clientSecret: 'cfg2', refreshToken: 'cfg3'}
        } as PipelineConfig);
        expect(auth).toEqual({ clientId: 'cfg1', clientSecret: 'cfg2', refreshToken: 'cfg3'});
    });

    it("should fallback to env in db branch if yt.clientId missing", async () => {
        process.env.YOUTUBE_CLIENT_ID = "env-id";
        process.env.YOUTUBE_CLIENT_SECRET = "env-secret";
        mockGetBundle.mockResolvedValueOnce({
            publishingAccounts: [
              { provider: "youtube", channelId: "ch1", id: "id1", encryptedToken: "enc1" },
            ],
        });
        const auth = await getYouTubeAuth(mockConfig);
        expect(auth).toEqual({
            clientId: "env-id",
            clientSecret: "env-secret",
            refreshToken: "mock-refresh-token",
        });
    });

    it("should return null if clientId missing in db branch", async () => {
        delete process.env.YOUTUBE_CLIENT_ID;
        delete process.env.YOUTUBE_CLIENT_SECRET;
        mockGetBundle.mockResolvedValueOnce({
            publishingAccounts: [
              { provider: "youtube", channelId: "ch1", id: "id1", encryptedToken: "enc1" },
            ],
        });
        const auth = await getYouTubeAuth(mockConfig);
        expect(auth).toBeNull();
    });
  });

  describe("validateYouTubeToken", () => {
    it("should return valid if token generates successfully", async () => {
      mockGetAccessToken.mockResolvedValueOnce({ token: "test" });
      const res = await validateYouTubeToken(mockConfig);
      expect(res.valid).toBe(true);
    });

    it("should return invalid if no auth is configured", async () => {
      mockGetBundle.mockResolvedValueOnce({ publishingAccounts: [] });
      const res = await validateYouTubeToken(mockConfig);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("credentials not configured");
    });

    it("should throw error if getAccessToken returns no token", async () => {
      mockGetAccessToken.mockResolvedValueOnce({});
      const res = await validateYouTubeToken(mockConfig);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Não foi possível");
    });

    it("should send reauth alert on invalid_grant", async () => {
      mockGetAccessToken.mockRejectedValueOnce(new Error("invalid_grant"));
      const res = await validateYouTubeToken(mockConfig);
      expect(res.valid).toBe(false);
      expect(sendReauthAlert).toHaveBeenCalled();
    });

    it("should catch sendReauthAlert error gracefully", async () => {
      mockGetAccessToken.mockRejectedValueOnce(new Error("invalid_grant"));
      vi.mocked(sendReauthAlert).mockRejectedValueOnce(new Error("Telegram failed"));

      const res = await validateYouTubeToken(mockConfig);
      expect(res.valid).toBe(false);
    });

    it("should handle invalid grant but auth is missing in retry block", async () => {
      mockGetAccessToken.mockRejectedValueOnce(new Error("invalid_grant"));

      let callCount = 0;
      mockGetBundle.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve({ publishingAccounts: [{ provider: "youtube", channelId: "test-channel", clientId: "c1", clientSecret: "c2", encryptedToken: "e1" }] });
          return Promise.resolve({ publishingAccounts: [] });
      });

      const res = await validateYouTubeToken(mockConfig);
      expect(res.valid).toBe(false);
      expect(sendReauthAlert).not.toHaveBeenCalled();
    });

    it("should handle error instance in validation", async () => {
        mockGetAccessToken.mockRejectedValueOnce(new Error("Some other error"));
        const res = await validateYouTubeToken(mockConfig);
        expect(res.valid).toBe(false);
    });

    it("should handle string error in validation", async () => {
        mockGetAccessToken.mockRejectedValueOnce("String err");
        const res = await validateYouTubeToken(mockConfig);
        expect(res.valid).toBe(false);
    });
  });

  describe("youtube-auth.service missing branches", () => {
      it("should handle error with missing message in catch block", async () => {
          mockGetAccessToken.mockRejectedValueOnce({});
          const res = await validateYouTubeToken({ managedRun: { channelId: "test-channel" } } as any);
          expect(res.valid).toBe(false);
      });

      it("should handle invalid grant but missing serverPublicUrl", async () => {
          mockGetAccessToken.mockRejectedValueOnce(new Error("invalid_grant"));
          const res = await validateYouTubeToken({ managedRun: { channelId: "test-channel" } } as any);
          expect(res.valid).toBe(false);
      });

      it("should fallback to channelId if channelName is missing when sending reauth alert", async () => {
          mockGetAccessToken.mockRejectedValueOnce(new Error("invalid_grant"));

          await validateYouTubeToken({
              managedRun: { channelId: "test-channel" },
              serverPublicUrl: "http://public"
          } as any);
          expect(sendReauthAlert).toHaveBeenCalledWith("test-channel", "test-channel", "http://reauth", expect.anything());
      });

      it("should handle db error when channelId is not present", async () => {
        mockGetBundle.mockImplementation(() => { throw new Error("DB Error") });
        const res = await getYouTubeAuth({ managedRun: {} } as any);
        expect(res).toBeNull();
      });

      it("should fallback when error is a falsy primitive", async () => {
          mockGetAccessToken.mockImplementationOnce(() => { throw null; });
          const res = await validateYouTubeToken(mockConfig);
          expect(res.valid).toBe(false);
      });

      it("should handle error entirely when falsy without message", async () => {
        mockGetAccessToken.mockRejectedValueOnce("");
        const res = await validateYouTubeToken({ managedRun: { channelId: "test-channel" } } as any);
        expect(res.valid).toBe(false);
      });

      it("should catch completely falsy error", async () => {
        mockGetAccessToken.mockImplementationOnce(() => { throw undefined; });
        const res = await validateYouTubeToken(mockConfig);
        expect(res.valid).toBe(false);
      });
  });
});
