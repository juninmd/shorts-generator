import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateYoutubeMetadata, uploadToYouTube, uploadFullVideoToYouTube, validateYouTubeToken, buildEngagementComment } from "../../src/core/youtube.service";
import { google } from "googleapis";
import fs from "node:fs";

// Mock googleapis
const insertMock = vi.fn();
const mockGetAccessToken = vi.fn();
const mockSendTelegramMessage = vi.fn();

vi.mock("grammy", () => {
  return {
    Bot: vi.fn().mockImplementation(function () {
      return {
        api: {
          sendMessage: mockSendTelegramMessage,
        },
      };
    }),
    InlineKeyboard: class {
      url = vi.fn().mockReturnThis();
    },
  };
});

vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        OAuth2: class {
          setCredentials = vi.fn();
          getAccessToken = (...args: any[]) => mockGetAccessToken(...args);
          generateAuthUrl = vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?mock=1");
        },
      },
      youtube: vi.fn().mockImplementation(() => ({
        videos: {
          insert: insertMock,
        },
      })),
    },
  };
});

// Mock fs
vi.mock("node:fs", () => ({
  default: {
    createReadStream: vi.fn().mockReturnValue("mock-stream"),
  },
}));

// Mock ai
import * as aiModule from "ai";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));

const mockIsDailyLimitReachedAsync = vi.fn().mockResolvedValue(false);
const mockSetDailyLimitReachedAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/core/state.js", () => ({
  isDailyLimitReachedAsync: (...args: any[]) => mockIsDailyLimitReachedAsync(...args),
  setDailyLimitReachedAsync: (...args: any[]) => mockSetDailyLimitReachedAsync(...args),
  incrementDailyUploadCountAsync: vi.fn(),
}));

// Mock logger
vi.mock("../../src/core/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Managed-channel YouTube auth now ALWAYS loads the live token from the control
// plane DB (no env/embedded fallback). Mock that chain so managed configs resolve
// a token; non-managed configs still use the env path in getYouTubeAuth.
const mockGetBundle = vi.fn();
vi.mock("../../src/core/control-plane-config.js", () => ({
  loadControlPlaneConfig: () => ({}),
  tryLoadControlPlaneConfig: () => ({}),
}));
vi.mock("../../src/core/control-plane-db.js", () => ({
  getControlPlanePool: () => ({}),
}));
vi.mock("../../src/core/secret-store.js", () => ({
  createSecretStore: () => ({ decryptToken: () => process.env.YOUTUBE_REFRESH_TOKEN || "789" }),
}));
vi.mock("../../src/core/channel-bundle-repository.js", () => ({
  ChannelBundleRepository: class {
    getBundle = (...args: any[]) => mockGetBundle(...args);
  },
}));

const youtubeAccountFixture = {
  provider: "youtube",
  id: "acc-1",
  channelId: "channel-123",
  clientId: "123",
  clientSecret: "456",
  encryptedToken: { keyVersion: "v1", iv: "iv", authTag: "tag", ciphertext: "cipher" },
};

describe("youtube.service", () => {
  const mockConfig = {
    aiProvider: "openrouter",
    aiModel: "google/gemma-3-4b-it:free",
    openrouterApiKey: "test-key",
  } as any;

  const mockShort = {
    id: "clip1",
    channelName: "Dummy Channel",
    clip: {
      title: "Original Title",
      description: "Original Description",
      reason: "viral",
      hashtags: ["#dummy"],
      transcript: [{ text: "Hello transcript segment" }],
    },
  } as any;

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    mockGetBundle.mockResolvedValue({ publishingAccounts: [youtubeAccountFixture] });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("generateYoutubeMetadata", () => {
    const setupMock = (content: string) => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: content } as any);
    };

    it("should return original metadata when ENABLE_YOUTUBE is not true", async () => {
      process.env.ENABLE_YOUTUBE = "false";
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Original Title",
        description: "Original Description",
        tags: ["dummy channel", "dummy", "shorts", "cortes"],
      });
    });

    it.each([
      ['{"title": "Viral Title", "description": "Viral Description"}'],
      ['```json\n{"title": "Viral Title", "description": "Viral Description"}\n```'],
      ['```\n{"title": "Viral Title", "description": "Viral Description"}\n```'],
      ['```json\n{"title": "Viral Title", "description": "Viral Description"}']
    ])("should parse metadata from AI successfully: %s", async (content) => {
      setupMock(content);
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Viral Title",
        description: "Viral Description",
        tags: ["dummy channel", "dummy", "shorts", "cortes"],
      });
    });

    it("should not duplicate original video link when AI includes it", async () => {
      setupMock('{"title": "Viral Title", "description": "Viral Description https://youtube.com/watch?v=original"}');
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.description).toBe("Viral Description https://youtube.com/watch?v=original");
    });

    it("should handle managed runs without focus labels", async () => {
      setupMock('{"title": "Viral Title", "description": "Viral Description", "tags": ["shorts"]}');
      const config = { ...mockConfig, managedRun: { runId: "run-1", channelId: "channel-1", channelName: "Channel" } };

      const result = await generateYoutubeMetadata(mockShort, config);

      expect(result.title).toBe("Viral Title");
      expect(result.tags).toEqual(["shorts", "dummy channel", "dummy", "cortes"]);
    });

    it("should pass the transcript in the AI prompt", async () => {
      setupMock('{"title": "Viral Title", "description": "Viral Description", "tags": ["shorts"]}');
      await generateYoutubeMetadata(mockShort, mockConfig);

      const calls = vi.mocked(aiModule.generateText).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const prompt = calls[0][0].prompt;
      expect(prompt).toContain('Transcrição do trecho/corte: "Hello transcript segment"');
    });


    it.each([
      { content: 'invalid json', expected: { title: "Original Title", description: "Original Description", tags: ["dummy channel", "dummy", "shorts", "cortes"] } },
      { content: '{"description": "Viral Description"}', expected: { title: "Original Title", description: "Viral Description", tags: ["dummy channel", "dummy", "shorts", "cortes"] } },
      { content: '{"title": "Viral Title"}', expected: { title: "Viral Title", description: "Original Description", tags: ["dummy channel", "dummy", "shorts", "cortes"] } }
    ])("should fallback properly when JSON parsing fails or misses fields: $content", async ({ content, expected }) => {
      setupMock(content);
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual(expected);
    });

    it("should handle error thrown by generateText", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      vi.mocked(aiModule.generateText).mockRejectedValueOnce(new Error("AI error"));
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Original Title",
        description: "Original Description",
        tags: ["dummy channel", "dummy", "shorts", "cortes"],
      });
    });
  });

  describe("buildEngagementComment", () => {
    it("asks a religious question for faith-focused channels and includes the link", () => {
      const text = buildEngagementComment("https://youtube.com/watch?v=abc", ["Católicos", "cortes"]);
      expect(text).toContain("tocou em você");
      expect(text).toContain("🎥 Vídeo original completo: https://youtube.com/watch?v=abc");
    });

    it("falls back to a generic opinion question without faith focus labels", () => {
      const text = buildEngagementComment("https://youtube.com/watch?v=abc", ["curiosidades"]);
      expect(text).toContain("Deixa sua opinião");
      expect(text).toContain("https://youtube.com/watch?v=abc");
    });

    it("handles missing focus labels", () => {
      expect(buildEngagementComment("https://u.rl")).toContain("Deixa sua opinião");
    });
  });

  const mockCredsSetup = (isEnabled = "true", id = "123", secret = "456", refresh = "789") => {
    process.env.ENABLE_YOUTUBE = isEnabled;
    process.env.YOUTUBE_CLIENT_ID = id;
    process.env.YOUTUBE_CLIENT_SECRET = secret;
    process.env.YOUTUBE_REFRESH_TOKEN = refresh;
  };

  const uploadTestCases = [
    { method: uploadToYouTube, name: "uploadToYouTube", expectedUrl: "https://youtube.com/shorts/yt123" },
    { method: uploadFullVideoToYouTube, name: "uploadFullVideoToYouTube", expectedUrl: "https://youtube.com/watch?v=yt123" }
  ];

  describe.each(uploadTestCases)("$name", ({ method, expectedUrl }) => {
    it.each([
      { enabled: "false", id: "123", desc: "ENABLE_YOUTUBE is false" },
      { enabled: "true", id: "", desc: "credentials are missing" }
    ])("should return null if $desc", async ({ enabled, id }) => {
      mockCredsSetup(enabled, id);
      const result = await method("video.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
    });

    it("should upload video successfully and return URL", async () => {
      mockCredsSetup();
      insertMock.mockResolvedValueOnce({ data: { id: "yt123" } });
      const result = await method("video.mp4", "Title", "Desc", mockConfig);
      expect(result).toBe(expectedUrl);
      expect(insertMock).toHaveBeenCalled();
    });

    it("should return null if upload succeeds but no id is returned", async () => {
      mockCredsSetup();
      insertMock.mockResolvedValueOnce({ data: {} });
      const result = await method("video.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
      expect(insertMock).toHaveBeenCalled();
    });

    it.each([
      { err: new Error("Error with 123, 456, and 789"), desc: "standard Error" },
      { err: "Error with 123", desc: "error string without message property" },
      { err: { code: 403, message: "quotaExceeded" }, desc: "quota error" }
    ])("should log error and handle failures for $desc", async ({ err }) => {
      vi.useFakeTimers();
      try {
        mockCredsSetup();
        insertMock.mockRejectedValue(err); // all retry attempts must fail
        const resultPromise = method("video.mp4", "Title", "Desc", mockConfig);
        await vi.runAllTimersAsync();
        const result = await resultPromise;
        expect(result).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("uploadToYouTube - specific tests", () => {
    it("should limit tags characters combined length to 490", async () => {
      mockCredsSetup();
      insertMock.mockResolvedValueOnce({ data: { id: "yt123" } });

      const longTags = Array.from({ length: 50 }, (_, i) => `tag${i}longextraseokeyword`);
      await uploadToYouTube("video.mp4", "Title", "Desc", mockConfig, longTags);

      const sentTags = insertMock.mock.calls[0][0].requestBody.snippet.tags;
      const combinedLength = sentTags.join(",").length;
      expect(combinedLength).toBeLessThanOrEqual(490);
      expect(sentTags.length).toBeLessThan(50);
    });

    it("should ignore invalid tags instead of failing before upload", async () => {
      mockCredsSetup();
      insertMock.mockResolvedValueOnce({ data: { id: "yt123" } });

      await uploadToYouTube("video.mp4", "Title", "Desc", mockConfig, ["tag1", undefined, "", "  tag2  "] as any);

      expect(insertMock.mock.calls[0][0].requestBody.snippet.tags).toEqual(["tag1", "tag2"]);
    });
  });

  describe("uploadFullVideoToYouTube - specific tests", () => {
    it("should trim title to 100 chars", async () => {
      mockCredsSetup();
      insertMock.mockResolvedValueOnce({ data: { id: "yt123" } });

      const longTitle = "a".repeat(150);
      await uploadFullVideoToYouTube("video.mp4", longTitle, "Desc", mockConfig);

      expect(insertMock.mock.calls[0][0].requestBody.snippet.title).toBe(longTitle.slice(0, 100));
    });
  });

  describe("Daily limit validation", () => {
    beforeEach(() => {
      mockIsDailyLimitReachedAsync.mockReset().mockResolvedValue(false);
      mockSetDailyLimitReachedAsync.mockReset().mockResolvedValue(undefined);
    });

    it("should abort upload and return null when daily limit is reached", async () => {
      mockCredsSetup();
      mockIsDailyLimitReachedAsync.mockResolvedValueOnce(true);

      const result = await uploadToYouTube("video.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
      expect(insertMock).not.toHaveBeenCalled();
      expect(mockIsDailyLimitReachedAsync).toHaveBeenCalledWith(mockConfig.dailyUploadLimit, "global");
    });

    it("should mark limit as reached when insert fails with quota exceeded error", async () => {
      vi.useFakeTimers();
      try {
        mockCredsSetup();
        const quotaError = new Error("The user has exceeded the number of videos they may upload.");
        insertMock.mockRejectedValue(quotaError);

        const resultPromise = uploadToYouTube("video.mp4", "Title", "Desc", mockConfig);
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result).toBeNull();
        expect(mockSetDailyLimitReachedAsync).toHaveBeenCalledWith("global");
      } finally {
        vi.useRealTimers();
      }
    });

    it("should use managedRun.channelId if present", async () => {
      mockCredsSetup();
      mockIsDailyLimitReachedAsync.mockResolvedValueOnce(true);
      const customConfig = {
        ...mockConfig,
        managedRun: {
          channelId: "channel-123",
          channelName: "Custom Channel",
          focusLabels: [],
        },
      };

      const result = await uploadToYouTube("video.mp4", "Title", "Desc", customConfig);
      expect(result).toBeNull();
      expect(mockIsDailyLimitReachedAsync).toHaveBeenCalledWith(customConfig.dailyUploadLimit, "channel-123");
    });
  });

  describe("validateYouTubeToken", () => {
    beforeEach(() => {
      mockGetAccessToken.mockReset();
      mockSendTelegramMessage.mockReset();
    });

    it("should return false if credentials are not configured", async () => {
      const result = await validateYouTubeToken({} as any);
      expect(result).toEqual({ valid: false, error: "YouTube credentials not configured" });
    });

    it("should return true if token is valid and credentials work", async () => {
      mockCredsSetup();
      mockGetAccessToken.mockResolvedValueOnce({ token: "access_token" });
      const result = await validateYouTubeToken(mockConfig);
      expect(result).toEqual({ valid: true });
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    it("should return false and send Telegram notification on auth error", async () => {
      mockCredsSetup();
      const authError = new Error("invalid_grant");
      mockGetAccessToken.mockRejectedValueOnce(authError);

      const customConfig = {
        ...mockConfig,
        telegramBotToken: "bot-token",
        telegramChatId: "chat-id",
        serverPublicUrl: "https://shorts-generator.example.com",
        managedRun: {
          channelId: "channel-123",
          channelName: "Custom Channel",
        },
      };

      const result = await validateYouTubeToken(customConfig);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid_grant");
      expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);

      const [chatId, text, options] = mockSendTelegramMessage.mock.calls[0];
      expect(chatId).toBe("chat-id");
      expect(text).toContain("TOKEN YOUTUBE EXPIRADO");
      expect(text).toContain("Custom Channel");
      expect(options.reply_markup).toBeDefined();
    });
  });
});

