import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVideoInfo, downloadAudioOnly, downloadVideoSection, cleanupVideo, getVideoFileSize, getChannelVideos } from "../../src/core/youtube.js";
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
    unlinkSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(),
    renameSync: vi.fn(),
    writeFileSync: vi.fn(),
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

  it("downloadAudioOnly resolves successfully", async () => {
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

    const downloaded = await downloadAudioOnly(video, mockConfig);
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

    const videos = await getChannelVideos("mychannel", 3);
    expect(videos).toEqual([]);
  });

  it("getChannelVideos fetches and filters videos", async () => {
    const mockOutput = [
      { id: "v1", title: "Vid1", duration: 100, live_status: "none" },
      { id: "v2", title: "Vid2", duration: 0, live_status: "none" }, // filtered out due to 0 duration
      { id: "v3", title: "Vid3", duration: 100, live_status: "is_upcoming" }, // filtered out due to upcoming
    ].map(v => JSON.stringify(v)).join("\n");

    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: mockOutput, stderr: "" });
      return {} as any;
    });

    const videos = await getChannelVideos("chan", 3);
    expect(videos).toHaveLength(1);
    expect(videos[0].id).toBe("v1");
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

  it("getYtDlpBaseArgs handles youtubeCookiesFile", async () => {
    const configWithFile = { ...mockConfig, youtubeCookiesFile: "cookies.txt" };
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: "100\n", stderr: "" });
      return {} as any;
    });
    const size = await getVideoFileSize("url", configWithFile);
    expect(size).toBe(100);
  });

  it("withCookies creates and deletes temp cookie file", async () => {
    const configWithCookies = { ...mockConfig, youtubeCookiesBase64: Buffer.from("cookies").toString("base64") };
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {});
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);

    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: "100\n", stderr: "" });
      return {} as any;
    });

    const size = await getVideoFileSize("url", configWithCookies);
    expect(size).toBe(100);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("verifyYoutubeAccess passes on successful format fetch", async () => {
    const { verifyYoutubeAccess } = await import("../../src/core/youtube.js");
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: "ID  EXT\n123 mp4", stderr: "" });
      return {} as any;
    });

    await expect(verifyYoutubeAccess(mockConfig)).resolves.not.toThrow();
  });

  it("getTopChannelVideos fetches and sorts videos", async () => {
    const { getTopChannelVideos } = await import("../../src/core/youtube.js");
    const mockOutput = [
      { id: "v1", title: "Vid1", duration: 100, view_count: 50 },
      { id: "v2", title: "Vid2", duration: 100, view_count: 150 },
    ].map(v => JSON.stringify(v)).join("\n");

    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: mockOutput, stderr: "" });
      return {} as any;
    });

    const videos = await getTopChannelVideos("chan", 2);
    expect(videos).toHaveLength(2);
    expect(videos[0].id).toBe("v2"); // Sorted by view_count desc
  });

  it("downloadVideoSection resolves correctly", async () => {
    const video = {
      id: "vid1",
      title: "Title",
      url: "url",
      channelName: "channel",
      channelUrl: "curl",
      duration: 120,
      publishedAt: "20230101",
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: "", stderr: "" });
      return {} as any;
    });

    const path = await downloadVideoSection(video, 10, 20, mockConfig);
    expect(path).toContain("vid1_");
  });
});
