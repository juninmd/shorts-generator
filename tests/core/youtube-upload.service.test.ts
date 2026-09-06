import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadToYouTube, uploadFullVideoToYouTube } from "../../src/core/youtube-upload.service.js";
import { google } from "googleapis";
import * as authService from "../../src/core/youtube-auth.service.js";
import * as state from "../../src/core/state.js";
import * as retry from "../../src/core/retry-backoff.js";
import * as telegram from "../../src/core/telegram.js";
import * as reauth from "../../src/core/youtube-reauth.js";
import type { PipelineConfig } from "../../src/types.js";
import fs from "node:fs";

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn(),
    },
    youtube: vi.fn(),
  },
}));

vi.mock("../../src/core/youtube-auth.service.js", () => ({
  getYouTubeAuth: vi.fn(),
  validateYouTubeToken: vi.fn(),
}));

vi.mock("../../src/core/state.js", () => ({
  isDailyLimitReachedAsync: vi.fn(),
  setDailyLimitReachedAsync: vi.fn(),
}));

vi.mock("../../src/core/retry-backoff.js", () => ({
  withRetry: vi.fn(),
}));

vi.mock("../../src/core/telegram.js", () => ({
  notifyYoutubePublished: vi.fn(),
  notifyYoutubeRateLimited: vi.fn(),
}));

vi.mock("../../src/core/youtube-reauth.js", () => ({
  generateReauthUrl: vi.fn().mockReturnValue("http://reauth"),
  sendReauthAlert: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    createReadStream: vi.fn().mockReturnValue("stream"),
  },
}));

describe("youtube-upload.service", () => {
  let mockConfig: PipelineConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_YOUTUBE = "true";
    mockConfig = {
      dailyUploadLimit: 5,
      serverPublicUrl: "http://public",
      managedRun: { channelId: "ch1", runId: "r1", channelName: "Channel 1", accountId: "acc1" },
    } as any;
  });

  describe("uploadToYouTube", () => {
    it("returns null if ENABLE_YOUTUBE is not true", async () => {
      process.env.ENABLE_YOUTUBE = "false";
      const result = await uploadToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
    });

    it("returns null if getYouTubeAuth returns null", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue(null);
      const result = await uploadToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
    });

    it("returns null if validateYouTubeToken returns valid=false", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "id", clientSecret: "sec", refreshToken: "ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: false, error: "err" });
      const result = await uploadToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
    });

    it("returns null if isDailyLimitReachedAsync returns true", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "id", clientSecret: "sec", refreshToken: "ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(true);
      const result = await uploadToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
    });

    it("uploads successfully and returns shorts URL", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "id", clientSecret: "sec", refreshToken: "ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      const mockSetCredentials = vi.fn();
      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: mockSetCredentials } as any;
      } as any);

      const mockInsert = vi.fn();
      vi.mocked(google.youtube).mockReturnValue({
        videos: { insert: mockInsert }
      } as any);

      vi.mocked(retry.withRetry).mockImplementation(async (cb) => {
        await cb();
        return { data: { id: "vid123" } };
      });

      const result = await uploadToYouTube("path", "title", "desc", mockConfig);

      expect(mockSetCredentials).toHaveBeenCalledWith({ refresh_token: "ref" });
      expect(mockInsert).toHaveBeenCalledWith({
        part: ["snippet", "status"],
        requestBody: expect.any(Object),
        media: { body: "stream" }
      });
      expect(result).toBe("https://youtube.com/shorts/vid123");
      expect(vi.mocked(telegram.notifyYoutubePublished)).toHaveBeenCalled();
    });

    it("handles upload rate limit error but already reached", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValueOnce(false).mockResolvedValueOnce(true); // second call is inside catch block

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);
      vi.mocked(google.youtube).mockReturnValue({} as any);

      vi.mocked(retry.withRetry).mockRejectedValue(new Error("The user has exceeded the number of videos they may upload."));

      const result = await uploadToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
      expect(vi.mocked(state.setDailyLimitReachedAsync)).toHaveBeenCalledWith("ch1");
      expect(vi.mocked(telegram.notifyYoutubeRateLimited)).not.toHaveBeenCalled();
    });

    it("handles upload rate limit error correctly", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false); // second call inside catch returns false

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);
      vi.mocked(google.youtube).mockReturnValue({} as any);

      vi.mocked(retry.withRetry).mockRejectedValue(new Error("The user has exceeded the number of videos they may upload."));

      const result = await uploadToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
      expect(vi.mocked(state.setDailyLimitReachedAsync)).toHaveBeenCalledWith("ch1");
      expect(vi.mocked(telegram.notifyYoutubeRateLimited)).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "youtube-quota" }),
        mockConfig
      );
    });

    it("handles invalid_grant error and sends reauth alert", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);
      vi.mocked(google.youtube).mockReturnValue({} as any);

      vi.mocked(retry.withRetry).mockRejectedValue(new Error("invalid_grant"));

      const result = await uploadToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
      expect(vi.mocked(reauth.sendReauthAlert)).toHaveBeenCalledWith("ch1", "Channel 1", "http://reauth", mockConfig);
    });

    it("limits tags correctly", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);

      const mockInsert = vi.fn();
      vi.mocked(google.youtube).mockReturnValue({
        videos: { insert: mockInsert }
      } as any);

      vi.mocked(retry.withRetry).mockImplementation(async (cb) => {
        await cb();
        return {};
      });

      const longTag = "a".repeat(400);
      const secondLongTag = "b".repeat(100);

      await uploadToYouTube("path", "title", "desc", mockConfig, [longTag, secondLongTag, "c"]);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            snippet: expect.objectContaining({
              tags: [longTag]
            })
          })
        })
      );
    });

    it("handles fallback tags for full video upload", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "id", clientSecret: "sec", refreshToken: "ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);

      const mockInsert = vi.fn();
      vi.mocked(google.youtube).mockReturnValue({
        videos: { insert: mockInsert }
      } as any);

      vi.mocked(retry.withRetry).mockImplementation(async (cb) => {
        await cb();
        return { data: { id: "vidfull" } };
      });

      const configNoFocus = { ...mockConfig, managedRun: { ...mockConfig.managedRun!, focusLabels: undefined } };

      const result = await uploadFullVideoToYouTube("path", "title", "desc", configNoFocus);

      expect(result).toBe("https://youtube.com/watch?v=vidfull");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            snippet: expect.objectContaining({
              tags: ["viral", "curiosidades"]
            })
          })
        })
      );
    });

    it("handles tags array with non-string and empty string values", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);

      const mockInsert = vi.fn();
      vi.mocked(google.youtube).mockReturnValue({
        videos: { insert: mockInsert }
      } as any);

      vi.mocked(retry.withRetry).mockImplementation(async (cb) => {
        await cb();
        return {};
      });

      await uploadToYouTube("path", "title", "desc", mockConfig, [123 as any, "  ", "valid"]);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            snippet: expect.objectContaining({
              tags: ["valid"]
            })
          })
        })
      );
    });

    it("handles upload but misses url and videoId", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);

      const mockInsert = vi.fn();
      vi.mocked(google.youtube).mockReturnValue({
        videos: { insert: mockInsert }
      } as any);

      vi.mocked(retry.withRetry).mockImplementation(async (cb) => {
        await cb();
        return { data: { } };
      });

      const res = await uploadToYouTube("path", "title", "desc", mockConfig, ["valid"]);

      expect(res).toBeNull();
    });

    it("handles upload without config managedRun", async () => {
      const configNoRun = { ...mockConfig, managedRun: undefined };
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);

      vi.mocked(google.youtube).mockReturnValue({
        videos: { insert: vi.fn() }
      } as any);

      vi.mocked(retry.withRetry).mockImplementation(async (cb) => {
        await cb();
        return { data: { id: "vid123" } };
      });

      const res = await uploadToYouTube("path", "title", "desc", configNoRun as any);
      expect(res).toBe("https://youtube.com/shorts/vid123");
    });

    it("handles upload error that is not an Error object", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);
      vi.mocked(google.youtube).mockReturnValue({} as any);

      vi.mocked(retry.withRetry).mockRejectedValue("String error");

      const result = await uploadToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
    });

    it("handles upload error that is completely empty", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);
      vi.mocked(google.youtube).mockReturnValue({} as any);

      vi.mocked(retry.withRetry).mockRejectedValue(null);

      const result = await uploadToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
    });

    it("handles serverPublicUrl undefined for invalid_grant", async () => {
      const configNoUrl = { ...mockConfig, serverPublicUrl: undefined };
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);
      vi.mocked(google.youtube).mockReturnValue({} as any);

      vi.mocked(retry.withRetry).mockRejectedValue(new Error("invalid_grant"));

      const result = await uploadToYouTube("path", "title", "desc", configNoUrl);
      expect(result).toBeNull();
      expect(vi.mocked(reauth.sendReauthAlert)).not.toHaveBeenCalled();
    });

    it("handles fallback to channelId if channelName is missing in reauth", async () => {
      const configNoName = { ...mockConfig, managedRun: { channelId: "ch1", accountId: "a1" } };
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "mock-id", clientSecret: "mock-sec", refreshToken: "mock-ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);
      vi.mocked(google.youtube).mockReturnValue({} as any);

      vi.mocked(retry.withRetry).mockRejectedValue(new Error("invalid_grant"));

      const result = await uploadToYouTube("path", "title", "desc", configNoName as any);
      expect(result).toBeNull();
      expect(vi.mocked(reauth.sendReauthAlert)).toHaveBeenCalledWith("ch1", "ch1", "http://reauth", configNoName);
    });
  });

  describe("uploadFullVideoToYouTube", () => {
    it("returns null if ENABLE_YOUTUBE is not true", async () => {
      process.env.ENABLE_YOUTUBE = "false";
      const result = await uploadFullVideoToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
    });

    it("returns null if getYouTubeAuth returns null", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue(null);
      const result = await uploadFullVideoToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
    });

    it("returns null if validateYouTubeToken returns valid=false", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "id", clientSecret: "sec", refreshToken: "ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: false, error: "err" });
      const result = await uploadFullVideoToYouTube("path", "title", "desc", mockConfig);
      expect(result).toBeNull();
    });

    it("uploads successfully and returns full video URL", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "id", clientSecret: "sec", refreshToken: "ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);

      vi.mocked(google.youtube).mockReturnValue({
        videos: { insert: vi.fn() }
      } as any);

      vi.mocked(retry.withRetry).mockResolvedValue({ data: { id: "vidfull" } });

      const result = await uploadFullVideoToYouTube("path", "title", "desc", mockConfig);

      expect(result).toBe("https://youtube.com/watch?v=vidfull");
      expect(vi.mocked(telegram.notifyYoutubePublished)).toHaveBeenCalled();
    });

    it("uploads full video passing specific tags array", async () => {
      vi.mocked(authService.getYouTubeAuth).mockResolvedValue({ clientId: "id", clientSecret: "sec", refreshToken: "ref" });
      vi.mocked(authService.validateYouTubeToken).mockResolvedValue({ valid: true });
      vi.mocked(state.isDailyLimitReachedAsync).mockResolvedValue(false);

      vi.mocked(google.auth.OAuth2).mockImplementation(function() {
        return { setCredentials: vi.fn() } as any;
      } as any);

      const mockInsert = vi.fn();
      vi.mocked(google.youtube).mockReturnValue({
        videos: { insert: mockInsert }
      } as any);

      vi.mocked(retry.withRetry).mockImplementation(async (cb) => {
        await cb();
        return { data: { id: "vidfull" } };
      });

      const result = await uploadFullVideoToYouTube("path", "title", "desc", mockConfig, ["my-tag"]);

      expect(result).toBe("https://youtube.com/watch?v=vidfull");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            snippet: expect.objectContaining({
              tags: ["my-tag"]
            })
          })
        })
      );
    });
  });
});
