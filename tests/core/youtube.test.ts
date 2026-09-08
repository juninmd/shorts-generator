import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVideoInfo, downloadAudioOnly, downloadVideoSection, cleanupVideo, getVideoFileSize, getChannelVideos } from "../../src/core/youtube.js";
import type { PipelineConfig } from "../../src/types.js";
import { execFile } from "node:child_process";
import fs from "node:fs";

vi.mock("node:child_process", () => ({
  execFileAsync: vi.fn(),
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

describe("youtube-channel", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("getTopChannelVideos handles exec error gracefully", async () => {
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(new Error("Fail fetch top"), { stdout: "", stderr: "err" });
      return {} as any;
    });

    const { getTopChannelVideos } = await import("../../src/core/youtube-channel.js");
    const videos = await getTopChannelVideos("mychannel", 3);
    expect(videos).toEqual([]);
  });

  it("getTopChannelVideos parses valid output", async () => {
    const mockOutput1 = {
      id: "vid2",
      title: "Title 2",
      url: "url2",
      channel: "channel",
      channel_url: "curl",
      duration: 120,
      upload_date: "20230101",
      thumbnail: "thumb",
      view_count: 500
    };

    const mockOutput2 = {
      id: "vid3",
      title: "Title 3",
      url: "url3",
      channel: "channel",
      channel_url: "curl",
      duration: 120,
      upload_date: "20230101",
      thumbnail: "thumb",
      view_count: 1000
    };

    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: JSON.stringify(mockOutput1) + "\n" + JSON.stringify(mockOutput2) + "\n", stderr: "" });
      return {} as any;
    });

    const { getTopChannelVideos } = await import("../../src/core/youtube-channel.js");
    const videos = await getTopChannelVideos("mychannel", 3);
    expect(videos.length).toBe(2);
    expect(videos[0].id).toBe("vid3"); // Sorted by view count
  });

  it("getChannelVideos parses valid output", async () => {
    const mockOutput1 = {
      id: "vid2",
      title: "Title 2",
      url: "url2",
      channel: "channel",
      channel_url: "curl",
      duration: 120,
      upload_date: "20230101",
      thumbnail: "thumb",
      live_status: "was_live"
    };

    const mockOutput2 = {
      id: "vid3",
      title: null,
      url: null,
      channel: null,
      channel_url: null,
      duration: "invalid",
      upload_date: null,
      thumbnail: "thumb",
      live_status: "is_upcoming"
    };

    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: JSON.stringify(mockOutput1) + "\n\n" + JSON.stringify(mockOutput2) + "\ninvalidjson\n", stderr: "" });
      return {} as any;
    });

    const { getChannelVideos } = await import("../../src/core/youtube-channel.js");
    const videos = await getChannelVideos("mychannel", 3);
    expect(videos.length).toBe(1);
    expect(videos[0].id).toBe("vid2");
  });

  it("getChannelVideos uses raw string ID correctly", async () => {
    const mockOutput1 = {
      id: "vid2",
      title: "Title 2",
      duration: 120,
    };

    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: JSON.stringify(mockOutput1) + "\n", stderr: "" });
      return {} as any;
    });

    const { getChannelVideos } = await import("../../src/core/youtube-channel.js");
    const videos = await getChannelVideos("http://youtube.com/mychannel", 3);
    expect(videos.length).toBe(1);
    expect(videos[0].channelName).toBe("http://youtube.com/mychannel");
  });

  it("getTopChannelVideos uses raw string ID correctly", async () => {
    const mockOutput1 = {
      id: "vid2",
      title: "Title 2",
      duration: 120,
    };

    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: JSON.stringify(mockOutput1) + "\n", stderr: "" });
      return {} as any;
    });

    const { getTopChannelVideos } = await import("../../src/core/youtube-channel.js");
    const videos = await getTopChannelVideos("http://youtube.com/mychannel", 3);
    expect(videos.length).toBe(1);
    expect(videos[0].channelName).toBe("http://youtube.com/mychannel");
  });

  it("getTopChannelVideos handles invalid json gracefully", async () => {
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: "invalidjson\n", stderr: "" });
      return {} as any;
    });

    const { getTopChannelVideos } = await import("../../src/core/youtube-channel.js");
    const videos = await getTopChannelVideos("mychannel", 3);
    expect(videos).toEqual([]);
  });

  it("getTopChannelVideos handles missing properties", async () => {
    const mockOutput1 = {
      id: "vid2",
      title: null,
      url: null,
      channel: null,
      channel_url: null,
      duration: "invalid",
      upload_date: null,
      thumbnail: "thumb",
      live_status: "is_upcoming",
      view_count: "invalid"
    };

    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: JSON.stringify(mockOutput1) + "\n\n", stderr: "" });
      return {} as any;
    });

    const { getTopChannelVideos } = await import("../../src/core/youtube-channel.js");
    const videos = await getTopChannelVideos("mychannel", 3);
    expect(videos.length).toBe(0);
  });

  it("getTopChannelVideos handles sorting with missing view_count", async () => {
    const mockOutput1 = {
      id: "vid2",
      title: "Title 2",
      url: "url2",
      channel: "channel",
      channel_url: "curl",
      duration: 120,
      upload_date: "20230101",
      thumbnail: "thumb",
    };

    const mockOutput2 = {
      id: "vid3",
      title: "Title 3",
      url: "url3",
      channel: "channel",
      channel_url: "curl",
      duration: 120,
      upload_date: "20230101",
      thumbnail: "thumb",
    };

    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: JSON.stringify(mockOutput1) + "\n" + JSON.stringify(mockOutput2) + "\n", stderr: "" });
      return {} as any;
    });

    const { getTopChannelVideos } = await import("../../src/core/youtube-channel.js");
    const videos = await getTopChannelVideos("mychannel", 3);
    expect(videos.length).toBe(2);
  });

  it("getTopChannelVideos handles empty lines in output", async () => {
    vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: "\n  \n", stderr: "" });
      return {} as any;
    });

    const { getTopChannelVideos } = await import("../../src/core/youtube-channel.js");
    const videos = await getTopChannelVideos("mychannel", 3);
    expect(videos.length).toBe(0);
  });
});
