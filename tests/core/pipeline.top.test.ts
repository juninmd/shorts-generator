import { describe, it, expect, vi, beforeEach } from "vitest";
import { runTopVideoPipeline } from "../../src/core/pipeline.js";
import * as youtube from "../../src/core/youtube.js";
import * as state from "../../src/core/state.js";
import * as telegram from "../../src/core/telegram.js";
import * as youtubeService from "../../src/core/youtube.service.js";
import * as ai from "ai";

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ text: "não" }),
}));

vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));

vi.mock("../../src/core/youtube.js", () => ({
  getTopChannelVideos: vi.fn(),
  getVideoInfo: vi.fn(),
  downloadAudioOnly: vi.fn(),
  downloadVideoSection: vi.fn(),
  cleanupVideo: vi.fn(),
  verifyYoutubeAccess: vi.fn(),
  getVideoFileSize: vi.fn(),
}));

vi.mock("../../src/core/state.js", () => ({
  getPostedTopVideos: vi.fn().mockReturnValue([]),
  markVideoAsPosted: vi.fn(),
  isDailyLimitReached: vi.fn().mockReturnValue(false),
  incrementDailyUploadCount: vi.fn(),
}));

vi.mock("../../src/core/telegram.js", () => ({
  sendFullVideoToTelegram: vi.fn().mockResolvedValue(123),
}));

vi.mock("../../src/core/youtube.service.js", () => ({
  uploadFullVideoToYouTube: vi.fn().mockResolvedValue("http://yt.be/abc"),
}));

describe("runTopVideoPipeline", () => {
  const mockConfig = {
    channels: ["chan1"],
    maxVideoDurationSec: 3600,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(state.getPostedTopVideos).mockReturnValue([]);
  });

  it("should abort if youtube access fails", async () => {
    vi.mocked(youtube.verifyYoutubeAccess).mockRejectedValueOnce(new Error("Access denied"));
    await expect(runTopVideoPipeline(mockConfig)).rejects.toThrow("Access denied");
  });

  it("should return empty if no channels", async () => {
    const result = await runTopVideoPipeline({ ...mockConfig, channels: [] });
    expect(result).toEqual([]);
  });

  it("should process a valid top video", async () => {
    const mockTopVideos = [{ id: "vid1", title: "Video", url: "url1", duration: 100 }];
    vi.mocked(youtube.getTopChannelVideos).mockResolvedValue(mockTopVideos as any);
    vi.mocked(youtube.getVideoInfo).mockResolvedValue({ ...mockTopVideos[0], channelName: "chan1" } as any);
    vi.mocked(youtube.downloadAudioOnly).mockResolvedValue({ filePath: "audio.wav" } as any);
    vi.mocked(youtube.downloadVideoSection).mockResolvedValue("video.mp4");
    vi.mocked(youtube.getVideoFileSize).mockResolvedValue(100);

    const onProgress = vi.fn();
    const result = await runTopVideoPipeline(mockConfig, onProgress);

    expect(result).toHaveLength(1);
    expect(result[0].videoId).toBe("vid1");
    expect(youtube.downloadVideoSection).toHaveBeenCalled();
    expect(youtubeService.uploadFullVideoToYouTube).toHaveBeenCalled();
    expect(telegram.sendFullVideoToTelegram).toHaveBeenCalled();
    expect(state.markVideoAsPosted).toHaveBeenCalledWith("vid1");
    expect(onProgress).toHaveBeenCalled();
  });

  it("should skip music videos", async () => {
    vi.mocked(ai.generateText).mockResolvedValueOnce({ text: "sim" } as any);
    const mockTopVideos = [{ id: "vid1", title: "Music", url: "url1", duration: 100 }];
    vi.mocked(youtube.getTopChannelVideos).mockResolvedValue(mockTopVideos as any);
    vi.mocked(youtube.getVideoFileSize).mockResolvedValue(100);

    const result = await runTopVideoPipeline(mockConfig);
    expect(result).toEqual([]);
  });

  it("should return empty if no unposted video found", async () => {
    vi.mocked(state.getPostedTopVideos).mockReturnValue(["vid1"]);
    const mockTopVideos = [{ id: "vid1", title: "Music", url: "url1", duration: 100 }];
    vi.mocked(youtube.getTopChannelVideos).mockResolvedValue(mockTopVideos as any);

    const result = await runTopVideoPipeline(mockConfig);
    expect(result).toEqual([]);
  });

  it("should handle error in processing top video", async () => {
    const mockTopVideos = [{ id: "vid1", title: "Video", url: "url1", duration: 100 }];
    vi.mocked(youtube.getTopChannelVideos).mockResolvedValue(mockTopVideos as any);
    vi.mocked(youtube.getVideoInfo).mockResolvedValue({ ...mockTopVideos[0], channelName: "chan1" } as any);
    vi.mocked(youtube.getVideoFileSize).mockResolvedValue(100);
    vi.mocked(youtube.downloadAudioOnly).mockRejectedValue(new Error("DL failed"));

    const result = await runTopVideoPipeline(mockConfig);
    expect(result).toHaveLength(1);
    expect(result[0].errors).toContain("DL failed");
  });

  it("should handle error in LLM checking gracefully", async () => {
    vi.mocked(ai.generateText).mockRejectedValue(new Error("LLM failed"));
    const mockTopVideos = [{ id: "vid1", title: "Video", url: "url1", duration: 100 }];
    vi.mocked(youtube.getTopChannelVideos).mockResolvedValue(mockTopVideos as any);
    vi.mocked(youtube.getVideoInfo).mockResolvedValue({ ...mockTopVideos[0], channelName: "chan1" } as any);
    vi.mocked(youtube.getVideoFileSize).mockResolvedValue(100);
    vi.mocked(youtube.downloadAudioOnly).mockResolvedValue({ filePath: "audio.wav" } as any);

    const result = await runTopVideoPipeline(mockConfig);
    expect(result).toHaveLength(1);
  });
});
