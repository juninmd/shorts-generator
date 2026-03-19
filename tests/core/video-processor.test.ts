import { describe, it, expect, vi, beforeEach } from "vitest";
import { processClip, getVideoDuration } from "../../src/core/video-processor.js";
import type { DownloadedVideo, ShortClip, PipelineConfig } from "../../src/types.js";
import fs from "node:fs";
import { execFile } from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
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
    videoEncoder: "libx264",
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
    vi.mocked(fs.existsSync).mockReturnValue(true);

    vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "", stderr: "" });
      return {} as any;
    });

    const result = await processClip(mockVideo, mockClip, mockConfig);

    expect(result.id).toBe("clip1");
    expect(result.outputPath).toContain("clip1.mp4");
    expect(result.subtitlePath).toContain("clip1.ass");
    expect(result.status).toBe("completed");

    const execFileCalls = vi.mocked(execFile).mock.calls;
    expect(execFileCalls.length).toBeGreaterThan(0);
    const args = execFileCalls[0][1] as string[];
    const vfArgIndex = args.indexOf("-vf");
    expect(vfArgIndex).toBeGreaterThan(-1);
    expect(args[vfArgIndex + 1]).toContain("crop=");
    expect(args[vfArgIndex + 1]).toContain("scale=");
    expect(args[vfArgIndex + 1]).toContain("ass=");
    expect(args[vfArgIndex + 1]).toContain("drawtext=fontfile=");
    expect(args[vfArgIndex + 1]).toContain("text=Test Watermark");
  });

  it("processClip should handle ffmpeg error events", async () => {
    const configWithoutWatermark = { ...mockConfig, watermarkText: "" };

    vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(new Error("Test error"), { stdout: "", stderr: "Test error stderr" });
      return {} as any;
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
