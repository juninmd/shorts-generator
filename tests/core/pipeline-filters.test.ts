import { describe, it, expect, vi, beforeEach } from "vitest";
import { isMusicVideoByTitle, isVideoWithinLimits, selectValidVideos, matchesVideoQuery } from "../../src/core/pipeline-filters.js";
import { generateText } from "ai";
import { createModel } from "../../src/core/ai-provider.js";
import { getVideoFileSize } from "../../src/core/youtube.js";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn(),
}));

vi.mock("../../src/core/youtube.js", () => ({
  getVideoFileSize: vi.fn(),
}));

describe("pipeline-filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isMusicVideoByTitle", () => {
    it("should return true if LLM says sim", async () => {
      vi.mocked(generateText).mockResolvedValue({ text: "Sim, é uma música" } as any);
      const res = await isMusicVideoByTitle("song", "channel", { aiProvider: "openrouter", aiModel: "model" } as any);
      expect(res).toBe(true);
    });

    it("should return false if LLM says não", async () => {
      vi.mocked(generateText).mockResolvedValue({ text: "Não" } as any);
      const res = await isMusicVideoByTitle("song", "channel", { aiProvider: "openrouter", aiModel: "model" } as any);
      expect(res).toBe(false);
    });

    it("should return false if generateText throws an error", async () => {
      vi.mocked(generateText).mockRejectedValue(new Error("API Error"));
      const res = await isMusicVideoByTitle("song", "channel", { aiProvider: "openrouter", aiModel: "model" } as any);
      expect(res).toBe(false);
    });
  });

  describe("isVideoWithinLimits", () => {
    it("should return false for upcoming live", async () => {
      const res = await isVideoWithinLimits({ liveStatus: "is_upcoming" } as any, {} as any);
      expect(res).toBe(false);
    });

    it("should return false if duration exceeds limit", async () => {
      const res = await isVideoWithinLimits({ duration: 100 } as any, { maxVideoDurationSec: 50 } as any);
      expect(res).toBe(false);
    });

    it("should return false if size exceeds limit", async () => {
      vi.mocked(getVideoFileSize).mockResolvedValue(100);
      const res = await isVideoWithinLimits({ duration: 10, url: "http" } as any, { maxVideoDurationSec: 50, skipVideoSizeCheck: false, maxVideoSizeBytes: 50 } as any);
      expect(res).toBe(false);
    });

    it("should return true if all checks pass", async () => {
      vi.mocked(getVideoFileSize).mockResolvedValue(10);
      const res = await isVideoWithinLimits({ duration: 10, url: "http" } as any, { maxVideoDurationSec: 50, skipVideoSizeCheck: false, maxVideoSizeBytes: 50 } as any);
      expect(res).toBe(true);
    });

    it("should return true if skipVideoSizeCheck is true", async () => {
      const res = await isVideoWithinLimits({ duration: 10, url: "http" } as any, { maxVideoDurationSec: 50, skipVideoSizeCheck: true } as any);
      expect(res).toBe(true);
    });

    it("should return true if remoteSize is null", async () => {
      vi.mocked(getVideoFileSize).mockResolvedValue(null);
      const res = await isVideoWithinLimits({ duration: 10, url: "http" } as any, { maxVideoDurationSec: 50, skipVideoSizeCheck: false, maxVideoSizeBytes: 50 } as any);
      expect(res).toBe(true);
    });
  });

  describe("selectValidVideos", () => {
    it("should select valid videos", async () => {
      vi.mocked(getVideoFileSize).mockResolvedValue(10);
      const videos = [
        { id: "1", title: "test", duration: 10, url: "url1" },
        { id: "2", title: "other", duration: 100, url: "url2" },
      ] as any;
      const res = await selectValidVideos(videos, { videoQuery: "test", maxVideoDurationSec: 50, skipVideoSizeCheck: false, maxVideoSizeBytes: 50, videoLimit: 1 } as any);
      expect(res.length).toBe(1);
      expect(res[0]!.id).toBe("1");
    });
  });

  describe("matchesVideoQuery", () => {
    it("should return true if no query", () => {
      expect(matchesVideoQuery({ title: "test" } as any, {} as any)).toBe(true);
    });

    it("should return true if query matches", () => {
      expect(matchesVideoQuery({ title: "test query" } as any, { videoQuery: "test" } as any)).toBe(true);
    });

    it("should return false if query does not match", () => {
      expect(matchesVideoQuery({ title: "other" } as any, { videoQuery: "test" } as any)).toBe(false);
    });
  });
});

  it('handles error in isMusicVideoByTitle (error branch)', async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error('llm err'));
    const result = await isMusicVideoByTitle('Song', 'Channel', {} as any);
    expect(result).toBe(false);
  });
