import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPipeline, processVideo, processUrl } from "../../src/core/pipeline.js";
import type { PipelineConfig, VideoInfo, DownloadedVideo, Transcript, ShortClip, GeneratedShort } from "../../src/types.js";

// Mock dependencies
import * as youtube from "../../src/core/youtube.js";
import * as transcriber from "../../src/core/transcriber.js";
import * as analyzer from "../../src/core/analyzer.js";
import * as processor from "../../src/core/video-processor.js";
import * as telegram from "../../src/core/telegram.js";

vi.mock("../../src/core/youtube.js", () => ({
  getChannelVideos: vi.fn(),
  getVideoInfo: vi.fn(),
  getVideoFileSize: vi.fn(),
  downloadVideo: vi.fn(),
  cleanupVideo: vi.fn(),
}));

vi.mock("../../src/core/transcriber.js", () => ({
  transcribeVideo: vi.fn(),
}));

vi.mock("../../src/core/analyzer.js", () => ({
  analyzeTranscript: vi.fn(),
}));

vi.mock("../../src/core/video-processor.js", () => ({
  processClip: vi.fn(),
}));

vi.mock("../../src/core/telegram.js", () => ({
  sendToTelegram: vi.fn(),
  sendSummary: vi.fn(),
}));

describe("pipeline", () => {
  const mockConfig = {
    specificUrls: ["url1"],
    channels: ["channel1"],
    maxVideoSizeBytes: 1000,
    minShortsPerVideo: 1,
  } as PipelineConfig;

  const mockVideoInfo: VideoInfo = {
    id: "vid1", title: "Vid", url: "url1", channelName: "Chan", channelUrl: "ChanUrl", duration: 100, publishedAt: "now"
  };

  const mockDownloadedVideo: DownloadedVideo = {
    ...mockVideoInfo, filePath: "file.mp4", audioPath: "audio.wav", fileSize: 500
  };

  const mockTranscript: Transcript = {
    videoId: "vid1", segments: [], words: [], fullText: "text", language: "en", duration: 100
  };

  const mockClip: ShortClip = {
    id: "clip1", videoId: "vid1", title: "Title", description: "Desc", startTime: 10, endTime: 20, duration: 10, viralScore: 9, reason: "", hookLine: "", transcript: [], words: [], hashtags: []
  };

  const mockGeneratedShort: GeneratedShort = {
    id: "clip1", clip: mockClip, outputPath: "out.mp4", subtitlePath: "sub.ass", originalVideoUrl: "url1", originalVideoTitle: "Vid", channelName: "Chan", status: "completed", createdAt: "now"
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(youtube.getVideoInfo).mockResolvedValue(mockVideoInfo);
    vi.mocked(youtube.getChannelVideos).mockResolvedValue([mockVideoInfo]);
    vi.mocked(youtube.getVideoFileSize).mockResolvedValue(500); // within limit
    vi.mocked(youtube.downloadVideo).mockResolvedValue(mockDownloadedVideo);

    vi.mocked(transcriber.transcribeVideo).mockResolvedValue(mockTranscript);
    vi.mocked(analyzer.analyzeTranscript).mockResolvedValue([mockClip]);
    vi.mocked(processor.processClip).mockResolvedValue(mockGeneratedShort);
    vi.mocked(telegram.sendToTelegram).mockResolvedValue(123);
  });

  it("runPipeline aggregates specificUrls and channels correctly", async () => {
    const results = await runPipeline(mockConfig);

    // 1 from specificUrls, 1 from channels => 2 videos processed
    expect(results).toHaveLength(2);
    expect(youtube.getVideoInfo).toHaveBeenCalledWith("url1");
    expect(youtube.getChannelVideos).toHaveBeenCalledWith("channel1", mockConfig.daysBack);
  });

  it("runPipeline filters oversized videos", async () => {
    vi.mocked(youtube.getVideoFileSize).mockResolvedValue(2000); // 2000 > 1000 limit

    const results = await runPipeline(mockConfig);
    expect(results).toHaveLength(0); // Both videos should be filtered out
  });

  it("processVideo handles full flow", async () => {
    const onProgress = vi.fn();
    const result = await processVideo(mockVideoInfo, mockConfig, onProgress);

    expect(result.videoId).toBe("vid1");
    expect(result.shorts).toHaveLength(1);
    expect(result.shorts[0]).toEqual(mockGeneratedShort);
    expect(result.errors).toHaveLength(0);

    expect(youtube.downloadVideo).toHaveBeenCalled();
    expect(transcriber.transcribeVideo).toHaveBeenCalled();
    expect(analyzer.analyzeTranscript).toHaveBeenCalled();
    expect(processor.processClip).toHaveBeenCalled();
    expect(telegram.sendToTelegram).toHaveBeenCalled();
    expect(telegram.sendSummary).toHaveBeenCalled();
    expect(youtube.cleanupVideo).toHaveBeenCalled();

    expect(onProgress).toHaveBeenCalled();
  });

  it("processVideo handles no clips found", async () => {
    vi.mocked(analyzer.analyzeTranscript).mockResolvedValue([]);
    const result = await processVideo(mockVideoInfo, mockConfig);

    expect(result.shorts).toHaveLength(0);
    expect(processor.processClip).not.toHaveBeenCalled();
    expect(telegram.sendToTelegram).not.toHaveBeenCalled();
  });

  it("processVideo handles errors gracefully", async () => {
    vi.mocked(transcriber.transcribeVideo).mockRejectedValue(new Error("Transcribe failed"));
    const result = await processVideo(mockVideoInfo, mockConfig);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Transcribe failed");
    expect(youtube.cleanupVideo).toHaveBeenCalled();
  });

  it("processUrl calls processVideo internally", async () => {
    const result = await processUrl("url1", mockConfig);
    expect(result).toBeDefined();
    expect(result?.videoId).toBe("vid1");
  });
});
