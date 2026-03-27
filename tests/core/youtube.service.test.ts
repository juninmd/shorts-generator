import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateYoutubeMetadata, uploadToYouTube, uploadFullVideoToYouTube } from "../../src/core/youtube.service";
import { google } from "googleapis";
import fs from "node:fs";

// Mock googleapis
const insertMock = vi.fn();

vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        OAuth2: class {
          setCredentials = vi.fn();
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

// Mock logger
vi.mock("../../src/core/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

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
      hookLine: "hook",
      hashtags: ["#dummy"],
    },
  } as any;

  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
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
      });
    });

    it.each([
      ['{"title": "Viral Title", "description": "Viral Description"}'],
      ['```json\n{"title": "Viral Title", "description": "Viral Description"}\n```'],
      ['```\n{"title": "Viral Title", "description": "Viral Description"}\n```']
    ])("should parse metadata from AI successfully: %s", async (content) => {
      setupMock(content);
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Viral Title",
        description: "Viral Description",
      });
    });



    it.each([
      { content: 'invalid json', expected: { title: "Original Title", description: "Original Description" } },
      { content: '{"description": "Viral Description"}', expected: { title: "Original Title", description: "Viral Description" } }
    ])("should fallback properly when JSON parsing fails or misses fields: $content", async ({ content, expected }) => {
      setupMock(content);
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual(expected);
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

    it.each([
      { err: new Error("Error with 123, 456, and 789"), desc: "standard Error" },
      { err: "Error with 123", desc: "error string without message property" }
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

  describe("uploadFullVideoToYouTube - specific tests", () => {
    it("should trim title to 100 chars", async () => {
      mockCredsSetup();
      insertMock.mockResolvedValueOnce({ data: { id: "yt123" } });

      const longTitle = "a".repeat(150);
      await uploadFullVideoToYouTube("video.mp4", longTitle, "Desc", mockConfig);

      expect(insertMock.mock.calls[0][0].requestBody.snippet.title).toBe(longTitle.slice(0, 100));
    });
  });
});
