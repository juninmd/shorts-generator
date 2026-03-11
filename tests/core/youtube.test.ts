import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVideoInfo, downloadVideo, cleanupVideo, getVideoFileSize, getChannelVideos } from "../../src/core/youtube.js";
import type { PipelineConfig } from "../../src/types.js";
import { execFile } from "node:child_process";
import fs from "node:fs";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    rmSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    renameSync: vi.fn(),
  },
}));

describe("youtube", () => {
  const mockConfig = {
    tempDir: "/tmp",
    maxVideoSizeBytes: 10000,
  } as PipelineConfig;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getVideoInfo parses yt-dlp output successfully", async () => {
    const mockOutput = {
      id: "vid1",
      title: "Title",
      url: "url",
      channel: "channel",
      channel_url: "curl",
      duration: 120,
      upload_date: "20230101",
      thumbnail: "thumb",
    };

    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: JSON.stringify(mockOutput) + "\n", stderr: "" });
      return {} as any;
    });

    const info = await getVideoInfo("url");
    expect(info).toBeDefined();
    expect(info?.id).toBe("vid1");
  });

  it("getVideoInfo returns null on error", async () => {
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(new Error("Fail"), { stdout: "", stderr: "err" });
      return {} as any;
    });

    const info = await getVideoInfo("url");
    expect(info).toBeNull();
  });

  it("downloadVideo resolves successfully", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (args && args.includes("--list-formats")) {
        // Mock some format list output so it parses valid formats
        if (typeof cb === "function") cb(null, { stdout: "ID  EXT   RESOLUTION\n123 mp4   1920x1080", stderr: "" });
      } else {
        if (typeof cb === "function") cb(null, { stdout: "Done", stderr: "" });
      }
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.mp4"] as any);

    const video = {
      id: "vid1",
      title: "Title",
      url: "url",
      channelName: "channel",
      channelUrl: "curl",
      duration: 120,
      publishedAt: "20230101",
    };

    const downloaded = await downloadVideo(video, mockConfig);
    expect(downloaded.fileSize).toBe(1024);
  });

  it("cleanupVideo calls rmSync", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    cleanupVideo("vid1", mockConfig);
    expect(fs.rmSync).toHaveBeenCalled();
  });

  it("getChannelVideos handles exec error gracefully", async () => {
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(new Error("Fail channel fetch"), { stdout: "", stderr: "err" });
      return {} as any;
    });

    const videos = await getChannelVideos("mychannel", 1);
    expect(videos).toEqual([]);
  });

  it("getVideoFileSize handles exec error gracefully", async () => {
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(new Error("Fail fetch size"), { stdout: "", stderr: "err" });
      return {} as any;
    });

    const size = await getVideoFileSize("url", mockConfig);
    expect(size).toBeNull();
  });

  it("getVideoFileSize returns null on invalid output", async () => {
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: "NA\n", stderr: "" });
      return {} as any;
    });

    const size = await getVideoFileSize("url", mockConfig);
    expect(size).toBeNull();
  });

  it("cleanupVideo handles rmSync error gracefully", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.rmSync).mockImplementation(() => {
      throw new Error("Failed to delete");
    });

    expect(() => cleanupVideo("vid1", mockConfig)).not.toThrow();
  });
});
