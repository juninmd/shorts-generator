import { describe, it, expect, vi, beforeEach } from "vitest";
import { processClip, getVideoDuration } from "../../src/core/video-processor.js";
import type { DownloadedVideo, ShortClip, PipelineConfig } from "../../src/types.js";
import fs from "node:fs";

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

vi.mock("fluent-ffmpeg", () => {
  const fluentMock = {
    setStartTime: vi.fn().mockReturnThis(),
    setDuration: vi.fn().mockReturnThis(),
    videoFilters: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    run: vi.fn().mockReturnThis(),
  };

  const ffprobeMock = vi.fn((path, cb) => cb(null, { format: { duration: 120 } }));

  const ffmpegMock = vi.fn(() => fluentMock) as any;
  ffmpegMock.ffprobe = ffprobeMock;

  return {
    default: ffmpegMock,
  };
});

describe("video-processor", () => {
  const mockConfig = {
    outputDir: "/output",
    verticalWidth: 1080,
    verticalHeight: 1920,
    watermarkText: "Test Watermark",
  } as PipelineConfig;

  const mockVideo: DownloadedVideo = {
    id: "vid1",
    filePath: "path/to/video.mp4",
    audioPath: "path/to/audio.wav",
    title: "Video Title",
    url: "https://youtube.com/watch?v=123",
    channelName: "Test Channel",
    channelUrl: "",
    duration: 600,
    publishedAt: "",
    fileSize: 1000,
  };

  const mockClip: ShortClip = {
    id: "clip1",
    videoId: "vid1",
    title: "Short Title",
    description: "Short Desc",
    startTime: 10,
    endTime: 20,
    duration: 10,
    viralScore: 8,
    reason: "good",
    hookLine: "hook",
    transcript: [],
    words: [],
    hashtags: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getVideoDuration returns correct duration", async () => {
    const duration = await getVideoDuration("test.mp4");
    expect(duration).toBe(120);
  });

  it("processClip should resolve and run ffmpeg with correct params", async () => {
    // We mock fluent-ffmpeg run to trigger the 'end' event.
    const ffmpegModule = await import("fluent-ffmpeg");
    vi.mocked(ffmpegModule.default().on).mockImplementation((event, handler) => {
      if (event === "end") {
        setTimeout(handler as any, 0); // simulate async completion
      }
      return ffmpegModule.default();
    });

    const result = await processClip(mockVideo, mockClip, mockConfig);

    expect(result.id).toBe("clip1");
    expect(result.outputPath).toContain("clip1.mp4");
    expect(result.subtitlePath).toContain("clip1.ass");
    expect(result.status).toBe("completed");

    // Verify watermark in videoFilters
    const videoFiltersCall = vi.mocked(ffmpegModule.default().videoFilters).mock.calls[0];
    const filtersParam = videoFiltersCall[0] as string;
    expect(filtersParam).toContain("drawtext=text='Test Watermark':x=w-tw-10:y=h-th-10:fontsize=18");
  });

  it("processClip should handle ffmpeg start, progress, and error events", async () => {
    const configWithoutWatermark = { ...mockConfig, watermarkText: "" };
    const ffmpegModule = await import("fluent-ffmpeg");
    vi.mocked(ffmpegModule.default().on).mockImplementation((event, handler) => {
      if (event === "start") {
        (handler as any)("ffmpeg -i test");
      } else if (event === "progress") {
        (handler as any)({ percent: 50.5 });
        (handler as any)({}); // progress without percent
      } else if (event === "error") {
        setTimeout(() => (handler as any)(new Error("Test error")), 0);
      }
      return ffmpegModule.default();
    });

    await expect(processClip(mockVideo, mockClip, configWithoutWatermark)).rejects.toThrow("Test error");
  });

  it("getVideoDuration handles errors", async () => {
    const ffmpegModule = await import("fluent-ffmpeg");
    vi.mocked(ffmpegModule.default.ffprobe).mockImplementationOnce((path, cb) => {
      cb(new Error("ffprobe error"), null as any);
    });

    await expect(getVideoDuration("test.mp4")).rejects.toThrow("ffprobe error");
  });

  it("getVideoDuration handles missing format duration", async () => {
    const ffmpegModule = await import("fluent-ffmpeg");
    vi.mocked(ffmpegModule.default.ffprobe).mockImplementationOnce((path, cb) => {
      cb(null, {} as any);
    });

    const duration = await getVideoDuration("test.mp4");
    expect(duration).toBe(0);
  });
});
