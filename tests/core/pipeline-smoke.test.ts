/**
 * End-to-end pipeline smoke test.
 * All external I/O (yt-dlp, ffmpeg, whisper, AI, telegram, youtube) is mocked.
 * Validates that runPipeline and processVideo orchestrate correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PipelineConfig } from "../../src/types.js";

// ── External tool mocks ──────────────────────────────────────────────────────

vi.mock("../../src/core/youtube.js", () => ({
  verifyYoutubeAccess: vi.fn().mockResolvedValue(undefined),
  getVideoInfo: vi.fn().mockResolvedValue({
    id: "smoke-video-id",
    title: "Smoke Test Video",
    url: "https://youtube.com/watch?v=smoke",
    channelName: "Smoke Channel",
    channelUrl: "",
    duration: 600,
    publishedAt: "20240101",
    thumbnailUrl: null,
    liveStatus: "not_live",
  }),
  getChannelVideos: vi.fn().mockResolvedValue([]),
  getTopChannelVideos: vi.fn().mockResolvedValue([]),
  downloadAudioOnly: vi.fn().mockResolvedValue({ id: "smoke-video-id", title: "Smoke Test Video", filePath: "/tmp/audio.wav", channelName: "Smoke Channel", url: "" }),
  downloadVideoSection: vi.fn().mockResolvedValue("/tmp/section.mp4"),
  cleanupVideo: vi.fn(),
}));

vi.mock("../../src/core/transcriber.js", () => ({
  transcribeVideo: vi.fn().mockResolvedValue({
    videoId: "smoke-video-id",
    duration: 600,
    language: "pt",
    segments: [{ start: 10, end: 70, text: "Este é um trecho de teste sobre fé e esperança." }],
    words: [],
  }),
}));

vi.mock("../../src/core/analyzer.js", () => ({
  analyzeTranscript: vi.fn().mockResolvedValue([{
    id: "clip-1",
    videoId: "smoke-video-id",
    title: "Clip de Teste",
    description: "Desc",
    startTime: 10,
    endTime: 65,
    duration: 55,
    viralScore: 9,
    reason: "Test",
    transcript: [],
    words: [],
    hashtags: ["#teste"],
  }]),
}));

vi.mock("../../src/core/video-processor.js", () => ({
  processClip: vi.fn().mockResolvedValue({
    id: "clip-1",
    outputPath: "/tmp/clip-1.mp4",
    clip: { title: "Clip de Teste", description: "Desc", viralScore: 9, duration: 55, startTime: 10, endTime: 65 },
    originalVideoUrl: "https://youtube.com/watch?v=smoke",
    originalVideoTitle: "Smoke Test Video",
    channelName: "Smoke Channel",
    status: "ready",
    createdAt: new Date().toISOString(),
  }),
  getFileStartTime: vi.fn().mockResolvedValue(10),
}));

vi.mock("../../src/core/telegram.js", () => ({
  sendToTelegram: vi.fn().mockResolvedValue(42),
  sendSummary: vi.fn().mockResolvedValue(undefined),
  sendErrorAlert: vi.fn().mockResolvedValue(undefined),
  sendFullVideoToTelegram: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/core/youtube.service.js", () => ({
  generateYoutubeMetadata: vi.fn().mockResolvedValue({ title: "Clip de Teste", description: "Desc" }),
  uploadToYouTube: vi.fn().mockResolvedValue(null),
  uploadFullVideoToYouTube: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../src/core/state.js", () => ({
  markVideoAsPostedAsync: vi.fn().mockResolvedValue(undefined),
  getPostedTopVideosAsync: vi.fn().mockResolvedValue([]),
  isDailyLimitReachedAsync: vi.fn().mockResolvedValue(false),
  incrementDailyUploadCountAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/core/pipeline-filters.js", () => ({
  isMusicVideoByTitle: vi.fn().mockResolvedValue(false),
  isVideoWithinLimits: vi.fn().mockResolvedValue(true),
  selectValidVideos: vi.fn().mockResolvedValue([]),
  matchesVideoQuery: vi.fn().mockReturnValue(true),
}));

vi.mock("../../src/core/queue.js", () => ({
  enqueueYoutubeUpload: vi.fn().mockResolvedValue(undefined),
  processQueueUntilEmpty: vi.fn().mockResolvedValue(undefined),
  closeQueueConnections: vi.fn().mockResolvedValue(undefined),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

import { runPipeline } from "../../src/core/pipeline.js";
import { processVideo } from "../../src/core/pipeline-video-processor.js";
import { sendToTelegram, sendSummary } from "../../src/core/telegram.js";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import { enqueueYoutubeUpload } from "../../src/core/queue.js";

function makeConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    channels: [],
    specificUrls: ["https://youtube.com/watch?v=smoke"],
    videoLimit: 1,
    maxVideoDurationSec: 3600,
    outputDir: "/tmp/output",
    tempDir: "/tmp/temp",
    whisperBaseUrl: "http://whisper.ai.svc.cluster.local:9000",
    aiProvider: "ollama",
    aiModel: "gemma3:1b",
    aiTimeoutMs: 30000,
    minShortDuration: 30,
    maxShortDuration: 90,
    maxClipsOverride: 1,
    verticalWidth: 1080,
    verticalHeight: 1920,
    videoEncoder: "libx264",
    maxVideoSizeMb: 500,
    dailyUploadLimit: 10,
    keepTempFiles: true,
    telegramBotToken: "",
    telegramChatId: "",
    ...overrides,
  } as PipelineConfig;
}

describe("Pipeline smoke test", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runPipeline processes a URL and returns results", async () => {
    const config = makeConfig();
    const progressEvents: string[] = [];

    const results = await runPipeline(config, (p) => progressEvents.push(p.stage));

    expect(results).toHaveLength(1);
    expect(results[0].videoId).toBe("smoke-video-id");
    expect(results[0].shorts).toHaveLength(1);
    expect(results[0].errors).toHaveLength(0);
    expect(progressEvents).toContain("downloading");
    expect(progressEvents).toContain("done");
  });

  it("runPipeline with no videos returns empty array", async () => {
    const { getVideoInfo } = await import("../../src/core/youtube.js");
    vi.mocked(getVideoInfo).mockResolvedValueOnce(null);

    const results = await runPipeline(makeConfig());
    expect(results).toHaveLength(0);
  });

  it.skip("runPipeline propagates YouTube access check failure", async () => {
    const { verifyYoutubeAccess } = await import("../../src/core/youtube.js");
    vi.mocked(verifyYoutubeAccess).mockRejectedValueOnce(new Error("Bot detected"));

    await expect(runPipeline(makeConfig())).rejects.toThrow("Bot detected");
  });

  it("processVideo returns result with clip and calls telegram", async () => {
    const video = {
      id: "smoke-video-id", title: "Smoke Test Video", url: "https://youtube.com/watch?v=smoke",
      channelName: "Smoke Channel", channelUrl: "", duration: 600,
      publishedAt: "20240101", thumbnailUrl: null, liveStatus: "not_live" as const,
    };

    const result = await processVideo(video, makeConfig());

    expect(result.videoId).toBe("smoke-video-id");
    expect(result.shorts).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(sendToTelegram).toHaveBeenCalledTimes(1);
    expect(sendSummary).toHaveBeenCalledTimes(1);
  });

  it("processVideo handles analyzer returning no clips gracefully", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValueOnce([]);

    const video = {
      id: "empty-video", title: "Empty", url: "https://youtube.com/watch?v=empty",
      channelName: "Ch", channelUrl: "", duration: 300,
      publishedAt: "20240101", thumbnailUrl: null, liveStatus: "not_live" as const,
    };

    const result = await processVideo(video, makeConfig());
    expect(result.shorts).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("processVideo queues YouTube upload when daily limit is reached", async () => {
    const { isDailyLimitReachedAsync, incrementDailyUploadCountAsync } = await import("../../src/core/state.js");
    const { uploadToYouTube } = await import("../../src/core/youtube.service.js");
    
    vi.mocked(isDailyLimitReachedAsync).mockResolvedValueOnce(true);

    const video = {
      id: "smoke-video-id", title: "Smoke Test Video", url: "https://youtube.com/watch?v=smoke",
      channelName: "Smoke Channel", channelUrl: "", duration: 600,
      publishedAt: "20240101", thumbnailUrl: null, liveStatus: "not_live" as const,
    };

    const config = {
      ...makeConfig(),
      managedRun: {
        channelId: "channel-456",
        channelName: "Test Channel",
        focusLabels: [],
      },
    };

    const originalEnableYoutube = process.env.ENABLE_YOUTUBE;
    process.env.ENABLE_YOUTUBE = "true";

    try {
      const result = await processVideo(video, config);

      expect(result.videoId).toBe("smoke-video-id");
      expect(isDailyLimitReachedAsync).toHaveBeenCalledWith(config.dailyUploadLimit, "channel-456");
      expect(uploadToYouTube).not.toHaveBeenCalled();
      expect(enqueueYoutubeUpload).toHaveBeenCalledTimes(1);
      expect(enqueueYoutubeUpload).toHaveBeenCalledWith(
        expect.objectContaining({ id: "clip-1", outputPath: "/tmp/clip-1.mp4" }),
        "Clip de Teste",
        "Desc",
        config,
        undefined,
      );
      expect(incrementDailyUploadCountAsync).not.toHaveBeenCalled();
      expect(sendToTelegram).toHaveBeenCalledTimes(1);
      expect(sendSummary).toHaveBeenCalledTimes(1);
    } finally {
      process.env.ENABLE_YOUTUBE = originalEnableYoutube;
    }
  });
});
