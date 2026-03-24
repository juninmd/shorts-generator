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

// Mock ollama
const chatMock = vi.fn();

vi.mock("ollama", () => {
  return {
    Ollama: class {
      chat = chatMock;
    },
  };
});

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
    ollamaBaseUrl: "http://localhost:11434",
    ollamaModel: "test-model",
  } as any;

  const mockShort = {
    id: "clip1",
    channelName: "Test Channel",
    clip: {
      title: "Original Title",
      description: "Original Description",
      reason: "viral",
      hookLine: "hook",
      hashtags: ["#test"],
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
    it("should return original metadata when ENABLE_YOUTUBE is not true", async () => {
      process.env.ENABLE_YOUTUBE = "false";
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Original Title",
        description: "Original Description",
      });
    });

    it("should generate and parse metadata from ollama successfully", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      chatMock.mockResolvedValueOnce({
        message: { content: '{"title": "Viral Title", "description": "Viral Description"}' },
      });

      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Viral Title",
        description: "Viral Description",
      });
      expect(chatMock).toHaveBeenCalled();
    });

    it("should strip markdown blocks from ollama response", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      chatMock.mockResolvedValueOnce({
        message: { content: '```json\n{"title": "Viral Title", "description": "Viral Description"}\n```' },
      });

      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Viral Title",
        description: "Viral Description",
      });
    });

    it("should use default model name when ollamaModel is not provided in config", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      chatMock.mockResolvedValueOnce({
        message: { content: '{"title": "Viral Title", "description": "Viral Description"}' },
      });

      const configWithoutModel = { ...mockConfig, ollamaModel: undefined };
      const result = await generateYoutubeMetadata(mockShort, configWithoutModel);

      expect(result).toEqual({
        title: "Viral Title",
        description: "Viral Description",
      });
      expect(chatMock).toHaveBeenCalledWith(expect.objectContaining({
        model: "gemma3:1b"
      }));
    });

    it("should strip markdown blocks without json language from ollama response", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      chatMock.mockResolvedValueOnce({
        message: { content: '```\n{"title": "Viral Title", "description": "Viral Description"}\n```' },
      });

      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Viral Title",
        description: "Viral Description",
      });
    });

    it("should fallback to original metadata when JSON parse fails", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      chatMock.mockResolvedValueOnce({
        message: { content: 'invalid json' },
      });

      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Original Title",
        description: "Original Description",
      });
    });

    it("should fallback to original title if ollama response lacks title", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      chatMock.mockResolvedValueOnce({
        message: { content: '{"description": "Viral Description"}' },
      });

      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result).toEqual({
        title: "Original Title",
        description: "Viral Description",
      });
    });
  });

  const mockCredsSetup = () => {
    process.env.ENABLE_YOUTUBE = "true";
    process.env.YOUTUBE_CLIENT_ID = "mock_client_id_val";
    process.env.YOUTUBE_CLIENT_SECRET = "mock_client_auth_val";
    process.env.YOUTUBE_REFRESH_TOKEN = "mock_refresh_token_val";
  };

  const uploadTestCases = [
    { method: uploadToYouTube, name: "uploadToYouTube", expectedUrl: "https://youtube.com/shorts/yt123" },
    { method: uploadFullVideoToYouTube, name: "uploadFullVideoToYouTube", expectedUrl: "https://youtube.com/watch?v=yt123" }
  ];

  describe.each(uploadTestCases)("$name", ({ method, name, expectedUrl }) => {
    it("should return null if ENABLE_YOUTUBE is false", async () => {
      process.env.ENABLE_YOUTUBE = "false";
      const result = await method("video.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
    });

    it("should return null if credentials are missing", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      process.env.YOUTUBE_CLIENT_ID = "";
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

    it("should log error and hide credentials when upload fails", async () => {
      mockCredsSetup();
      const errorMsg = "Error with mock_client_id_val, mock_client_auth_val, and mock_refresh_token_val";
      insertMock.mockRejectedValueOnce(new Error(errorMsg));

      const result = await method("video.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
    });

    it("should handle error string without message property", async () => {
      mockCredsSetup();
      insertMock.mockRejectedValueOnce("Error with mock_client_id_val");

      const result = await method("video.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
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
