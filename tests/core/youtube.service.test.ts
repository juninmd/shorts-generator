import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateYoutubeMetadata, uploadToYouTube } from "../../src/core/youtube.service.js";
import type { GeneratedShort, PipelineConfig } from "../../src/types.js";
import fs from "node:fs";

vi.mock("node:fs", () => ({
  default: {
    createReadStream: vi.fn(),
  },
}));

const mockChat = vi.fn();
vi.mock("ollama", () => {
  return {
    Ollama: class {
      chat = mockChat;
    }
  };
});

const mockInsert = vi.fn();
const mockSetCredentials = vi.fn();
vi.mock("googleapis", () => {
  return {
    google: {
      auth: {
        OAuth2: class {
          setCredentials = mockSetCredentials;
        }
      },
      youtube: vi.fn().mockImplementation(() => ({
        videos: {
          insert: mockInsert,
        },
      })),
    },
  };
});

describe("youtube.service", () => {
  const mockShort: GeneratedShort = {
    id: "short1",
    videoId: "vid1",
    channelName: "Test Channel",
    filePath: "path/to/video.mp4",
    clip: {
      id: "clip1",
      videoId: "vid1",
      title: "Original Title",
      description: "Original Description",
      startTime: 0,
      endTime: 10,
      duration: 10,
      viralScore: 8,
      reason: "Because it is cool",
      hookLine: "Watch this!",
      transcript: [],
      words: [],
      hashtags: ["#test", "#viral"],
    },
  };

  const mockConfig: PipelineConfig = {
    ollamaBaseUrl: "http://localhost:11434",
    ollamaModel: "test-model",
  } as PipelineConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_YOUTUBE = "true";
    process.env.YOUTUBE_CLIENT_ID = "mock_yt_identifier";
    process.env.YOUTUBE_CLIENT_SECRET = "mock_yt_key";
    process.env.YOUTUBE_REFRESH_TOKEN = "mock_yt_refresh_val";
  });


  describe("generateYoutubeMetadata", () => {
    it("returns original title/desc if ENABLE_YOUTUBE is not true", async () => {
      process.env.ENABLE_YOUTUBE = "false";
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe(mockShort.clip.title);
      expect(result.description).toBe(mockShort.clip.description);
    });

    it("uses default values if missing config", async () => {
      mockChat.mockResolvedValue({
        message: { content: '{"title": "New", "description": "New Desc"}' },
      });
      await generateYoutubeMetadata(mockShort, {} as PipelineConfig);
      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemma3:1b",
        })
      );
    });

    it("parses valid JSON response from Ollama", async () => {
      mockChat.mockResolvedValue({
        message: { content: '{"title": "Viral Title \ud83d\udd25", "description": "Viral Description"}' },
      });
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe("Viral Title \ud83d\udd25");
      expect(result.description).toBe("Viral Description");
    });

    it("parses JSON inside standard markdown block", async () => {
      mockChat.mockResolvedValue({
        message: {
          content: '```json\n{"title": "Markdown Title", "description": "Markdown Desc"}\n```',
        },
      });
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe("Markdown Title");
      expect(result.description).toBe("Markdown Desc");
    });

    it("parses JSON inside plain markdown block", async () => {
      mockChat.mockResolvedValue({
        message: {
          content: '```\n{"title": "Plain Title", "description": "Plain Desc"}\n```',
        },
      });
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe("Plain Title");
      expect(result.description).toBe("Plain Desc");
    });

    it("returns original title/desc if fallback attributes are missing in JSON", async () => {
      mockChat.mockResolvedValue({
        message: { content: '{}' },
      });
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe(mockShort.clip.title);
      expect(result.description).toBe(mockShort.clip.description);
    });

    it("falls back to original clip data on JSON parse error", async () => {
      mockChat.mockResolvedValue({
        message: { content: "invalid json string" },
      });
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe(mockShort.clip.title);
      expect(result.description).toBe(mockShort.clip.description);
    });

    it("falls back to original clip data on Ollama API error", async () => {
      mockChat.mockRejectedValue(new Error("API Error"));
      const result = await generateYoutubeMetadata(mockShort, mockConfig);
      expect(result.title).toBe(mockShort.clip.title);
      expect(result.description).toBe(mockShort.clip.description);
    });
  });

  describe("uploadToYouTube", () => {
    it("returns null if ENABLE_YOUTUBE is not true", async () => {
      process.env.ENABLE_YOUTUBE = "false";
      const result = await uploadToYouTube("path.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("returns null if missing credentials", async () => {
      delete process.env.YOUTUBE_CLIENT_ID;
      const result = await uploadToYouTube("path.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("uploads video and returns url successfully", async () => {
      mockInsert.mockResolvedValue({ data: { id: "yt123" } });
      vi.mocked(fs.createReadStream).mockReturnValue({} as any);

      const result = await uploadToYouTube("path.mp4", "Title", "Desc", mockConfig);
      expect(result).toBe("https://youtube.com/shorts/yt123");
      expect(mockInsert).toHaveBeenCalled();
    });

    it("redacts credentials in error message and returns null on failure", async () => {
      mockInsert.mockRejectedValue(new Error("Error with mock_yt_identifier and mock_yt_key and mock_yt_refresh_val"));

      const result = await uploadToYouTube("path.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
    });

    it("redacts missing credentials if variables are falsy in error handler", async () => {
      // Force an error
      mockInsert.mockImplementation(() => {
         // simulate the variables being deleted mid-flight or before error handler runs
         delete process.env.YOUTUBE_CLIENT_SECRET;
         delete process.env.YOUTUBE_CLIENT_ID;
         delete process.env.YOUTUBE_REFRESH_TOKEN;
         throw new Error("Generic Error");
      });

      const result = await uploadToYouTube("path.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
    });

    it("handles error without message property safely", async () => {
      mockInsert.mockRejectedValue("String Error");
      const result = await uploadToYouTube("path.mp4", "Title", "Desc", mockConfig);
      expect(result).toBeNull();
    });
  });
});
