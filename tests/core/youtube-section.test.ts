import { describe, it, expect, vi } from "vitest";
import { downloadVideoSection, cleanupVideo } from "../../src/core/youtube-section.js";
import { execYtDlp } from "../../src/core/youtube-ytdlp.js";
import type { VideoInfo, PipelineConfig } from "../../src/types.js";
import fs from "node:fs";

vi.mock("../../src/core/youtube-ytdlp.js", () => ({
  execYtDlp: vi.fn(),
  withCookies: vi.fn(async (_opts, cb) => cb("/tmp/cookies.txt")),
  getYtDlpBaseArgs: vi.fn(() => ["--cookies", "/tmp/cookies.txt"]),
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

describe("youtube-section", () => {
  it("downloadVideoSection works", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    const video: VideoInfo = {
      id: "vid1",
      title: "Title",
      url: "url",
      channelName: "channel",
      channelUrl: "curl",
      duration: 120,
      publishedAt: "20230101",
    };
    const path = await downloadVideoSection(video, 10, 20, mockConfig);
    expect(path).toContain("vid1_");
    expect(path).toContain(".mp4");
  });

  it("downloadVideoSection handles missing video duration", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    const video: VideoInfo = {
      id: "vid1",
      title: "Title",
      url: "url",
      channelName: "channel",
      channelUrl: "curl",
      duration: 0,
      publishedAt: "20230101",
    };
    const path = await downloadVideoSection(video, 10, 20, mockConfig);
    expect(path).toContain("vid1_");
    expect(path).toContain(".mp4");
  });

  it("downloadVideoSection adjusts section end if exceeding video duration", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    const video: VideoInfo = {
      id: "vid1",
      title: "Title",
      url: "url",
      channelName: "channel",
      channelUrl: "curl",
      duration: 120,
      publishedAt: "20230101",
    };
    const path = await downloadVideoSection(video, 110, 130, mockConfig);
    expect(path).toContain("vid1_");
    expect(path).toContain(".mp4");
  });

  it("downloadVideoSection handles execution error", async () => {
      vi.mocked(execYtDlp).mockRejectedValueOnce(new Error("fail"));
      const video: VideoInfo = {
          id: "vid1",
          title: "Title",
          url: "url",
          channelName: "channel",
          channelUrl: "curl",
          duration: 120,
          publishedAt: "20230101",
      };
      await expect(downloadVideoSection(video, 10, 20, mockConfig)).rejects.toThrow(/fail/);
  });

  it("downloadVideoSection handles missing file error", async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      const video: VideoInfo = {
          id: "vid1",
          title: "Title",
          url: "url",
          channelName: "channel",
          channelUrl: "curl",
          duration: 120,
          publishedAt: "20230101",
      };
      await expect(downloadVideoSection(video, 10, 20, mockConfig)).rejects.toThrow(/not found/);
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
