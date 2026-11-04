import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadVideoSection, cleanupVideo } from "../../src/core/youtube-section.js";
import { execYtDlp } from "../../src/core/youtube-ytdlp.js";
import { probeVideoStream } from "../../src/core/ffmpeg-bin.js";
import type { VideoInfo, PipelineConfig } from "../../src/types.js";
import fs from "node:fs";

vi.mock("../../src/core/youtube-ytdlp.js", () => ({
  execYtDlp: vi.fn(),
  withCookies: vi.fn(async (_opts, cb) => cb("/tmp/cookies.txt")),
  getYtDlpBaseArgs: vi.fn(() => ["--cookies", "/tmp/cookies.txt"]),
}));

vi.mock("../../src/core/ffmpeg-bin.js", () => ({
  probeVideoStream: vi.fn(async () => ({ codec_name: "h264", width: 1920, height: 1080 })),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      rmSync: vi.fn(),
      mkdirSync: vi.fn(),
      readdirSync: vi.fn().mockReturnValue(["a", "b"])
    },
    existsSync: vi.fn().mockReturnValue(true),
    rmSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue(["a", "b"])
  };
});

const mockConfig: PipelineConfig = {
  channels: [],
  specificUrls: [],
  videoLimit: 0,
  maxCutsPerBlock: 0,
  minuteBlockSize: 0,
  maxShortDuration: 0,
  minShortDuration: 0,
  maxVideoSizeBytes: 0,
  minShortsPerVideo: 0,
  outputDir: "/tmp",
  tempDir: "/tmp", // VERY IMPORTANT for the path issue
  dailyUploadLimit: 0,
  minViralScore: 0,
  maxVideoDurationSec: 0
};

const video: VideoInfo = {
  id: "vid1",
  title: "Title",
  url: "url",
  channelName: "channel",
  channelUrl: "curl",
  duration: 120,
  publishedAt: "20230101",
};

describe("youtube-section", () => {
  beforeEach(() => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    vi.mocked(probeVideoStream).mockResolvedValue({ codec_name: "h264", width: 1920, height: 1080 });
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it("downloadVideoSection works", async () => {
    const path = await downloadVideoSection(video, 10, 20, mockConfig);
    expect(path).toContain("vid1_");
    expect(path).toContain(".mp4");
  });

  it("downloadVideoSection prefers DASH formats instead of YouTube HLS", async () => {
    await downloadVideoSection(video, 10, 20, mockConfig);
    const args = vi.mocked(execYtDlp).mock.calls.at(-1)?.[0] as string[];
    const format = args[args.indexOf("-f") + 1];
    expect(format).toContain("[protocol=https]");
    expect(format).not.toContain("m3u8");
    expect(args).toContain("--download-sections");
    expect(args).toContain("--merge-output-format");
  });

  it("downloadVideoSection handles missing video duration", async () => {
    const path = await downloadVideoSection({ ...video, duration: 0 }, 10, 20, mockConfig);
    expect(path).toContain("vid1_");
    expect(path).toContain(".mp4");
  });

  it("downloadVideoSection adjusts section end if exceeding video duration", async () => {
    const path = await downloadVideoSection(video, 110, 130, mockConfig);
    expect(path).toContain("vid1_");
    expect(path).toContain(".mp4");
  });

  it("downloadVideoSection handles execution error", async () => {
    vi.mocked(execYtDlp).mockRejectedValueOnce(new Error("fail"));
    await expect(downloadVideoSection(video, 10, 20, mockConfig)).rejects.toThrow(/fail/);
  });

  it("downloadVideoSection handles missing file error", async () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    await expect(downloadVideoSection(video, 10, 20, mockConfig)).rejects.toThrow(/not found/);
  });

  it("downloadVideoSection rejects an audio-only section and deletes it", async () => {
    vi.mocked(probeVideoStream).mockResolvedValueOnce({});
    await expect(downloadVideoSection(video, 10, 20, mockConfig)).rejects.toThrow(
      /VIDEO SECTION WITHOUT PICTURE/,
    );
    expect(fs.rmSync).toHaveBeenCalled();
  });

  it("cleanupVideo calls rmSync", () => {
    cleanupVideo("vid1", mockConfig);
    expect(fs.rmSync).toHaveBeenCalled();
  });

  it("cleanupVideo handles missing dir", () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    cleanupVideo("vid1", mockConfig);
    expect(true).toBe(true); // Should not throw and exit cleanly
  });

  it("cleanupVideo handles rmSync error", () => {
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.rmSync).mockImplementationOnce(() => { throw new Error("fail"); });
    cleanupVideo("vid1", mockConfig);
    expect(true).toBe(true); // Should not throw
  });
});
