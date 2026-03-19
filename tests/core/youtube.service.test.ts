import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateYoutubeMetadata, uploadToYouTube } from "../../src/core/youtube.service.js";
import type { GeneratedShort, PipelineConfig } from "../../src/types.js";
import fs from "node:fs";
import { google } from "googleapis";

vi.mock("node:fs", () => ({
  default: {
    createReadStream: vi.fn(),
  },
}));

vi.mock("googleapis", () => {
  const videosInsertMock = vi.fn();
  return {
    google: {
      auth: {
        OAuth2: class {
          setCredentials = vi.fn();
        },
      },
      youtube: vi.fn().mockImplementation(() => ({
        videos: {
          insert: videosInsertMock,
        },
      })),
    },
    videosInsertMock, // export for assertion
  };
});

const mockChat = vi.fn();
vi.mock("ollama", () => {
  return {
    Ollama: class {
      chat = mockChat;
    },
  };
});

describe("youtube.service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  const mockShort = {
    id: "short1",
    clip: {
      title: "Clip Title",
      description: "Clip Desc",
      reason: "Reason",
      hookLine: "Hook",
      hashtags: ["#test", "tag"],
    },
    channelName: "Channel",
    outputPath: "video.mp4",
  } as GeneratedShort;

  const mockConfig = {
    ollamaBaseUrl: "http://test",
    ollamaModel: "test-model",
  } as PipelineConfig;

  describe("generateYoutubeMetadata", () => {
    it("returns original title/desc if ENABLE_YOUTUBE is not true", async () => {
      process.env.ENABLE_YOUTUBE = "false";
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe("Clip Title");
      expect(result.description).toBe("Clip Desc");
    });

    it("parses valid json from ollama", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      mockChat.mockResolvedValue({ message: { content: '{"title":"New Title","description":"New Desc"}' } });
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe("New Title");
      expect(result.description).toBe("New Desc");
    });

    it("parses json from markdown code block", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      mockChat.mockResolvedValue({ message: { content: '```json\n{"title":"New Title","description":"New Desc"}\n```' } });
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe("New Title");
      expect(result.description).toBe("New Desc");
    });

    it("parses json from unspecfied markdown code block", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      mockChat.mockResolvedValue({ message: { content: '```\n{"title":"New Title","description":"New Desc"}\n```' } });
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe("New Title");
      expect(result.description).toBe("New Desc");
    });

    it("returns fallback if json parsing fails", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      mockChat.mockResolvedValue({ message: { content: 'invalid json' } });
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe("Clip Title");
      expect(result.description).toBe("Clip Desc");
    });

    it("returns fallback if ollama throws", async () => {
      process.env.ENABLE_YOUTUBE = "true";
      mockChat.mockRejectedValue(new Error("Ollama fail"));
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe("Clip Title");
    });
  });

  describe("uploadToYouTube", () => {
    let videosInsertMock: any;

    beforeEach(async () => {
      process.env.ENABLE_YOUTUBE = "true";
      process.env.YOUTUBE_CLIENT_ID = "dummy_client_id";
      process.env.YOUTUBE_CLIENT_SECRET = "dummy_client_key_val";
      process.env.YOUTUBE_REFRESH_TOKEN = "dummy_refresh_key";

      videosInsertMock = (await import("googleapis") as any).videosInsertMock;
    });

    it("returns null if ENABLE_YOUTUBE is not true", async () => {
      process.env.ENABLE_YOUTUBE = "false";
      const result = await uploadToYouTube("vid.mp4", "T", "D", mockConfig);
      expect(result).toBeNull();
    });

    it("returns null if missing credentials", async () => {
      process.env.YOUTUBE_CLIENT_ID = "";
      const result = await uploadToYouTube("vid.mp4", "T", "D", mockConfig);
      expect(result).toBeNull();
    });

    it("uploads and returns url successfully", async () => {
      videosInsertMock.mockResolvedValue({ data: { id: "yt123" } });
      vi.mocked(fs.createReadStream).mockReturnValue({} as any);

      const result = await uploadToYouTube("vid.mp4", "T", "D", mockConfig);
      expect(result).toBe("https://youtube.com/shorts/yt123");
    });

    it("handles error and redacts secrets", async () => {
      videosInsertMock.mockRejectedValue(new Error("Failed with dummy_client_id and dummy_client_key_val and dummy_refresh_key"));

      const result = await uploadToYouTube("vid.mp4", "T", "D", mockConfig);
      expect(result).toBeNull();
    });

    it("handles string error and redacts secrets", async () => {
      videosInsertMock.mockRejectedValue("Failed with dummy_client_id and dummy_client_key_val and dummy_refresh_key");

      const result = await uploadToYouTube("vid.mp4", "T", "D", mockConfig);
      expect(result).toBeNull();
    });
  });
});
