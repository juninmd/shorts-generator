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
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

describe("youtube", () => {
  const mockConfig = {
    tempDir: "/tmp",
    maxVideoSizeBytes: 10000,
  } as PipelineConfig;

  const mockVideoBase = {
    id: "vid1",
    title: "Title",
    url: "url",
    channelName: "channel",
    channelUrl: "curl",
    duration: 120,
    publishedAt: "20230101",
  };

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

    const downloaded = await downloadVideo(mockVideoBase, mockConfig);
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

  it("getChannelVideos handles empty lines", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: " \n", stderr: "" });
      return {} as any;
    });

    const videos = await getChannelVideos("mychannel", 1);
    expect(videos).toEqual([]);
  });

  it("getVideoInfo handles multiple lines", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (typeof cb === "function") cb(null, { stdout: "garbage\n{\"id\":\"vid1\",\"duration\":120}\n", stderr: "" });
      return {} as any;
    });

    const info = await getVideoInfo("url");
    expect(info?.id).toBe("vid1");
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

  describe("verifyYoutubeAccess", () => {
    it("verifies successfully if stdout contains ID and EXT", async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(null, { stdout: "ID  EXT   RESOLUTION\n123 mp4   1920x1080", stderr: "" });
        return {} as any;
      });

      await expect(import("../../src/core/youtube.js").then(m => m.verifyYoutubeAccess(mockConfig))).resolves.not.toThrow();
    });

    it("throws if formats not found in stdout", async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(null, { stdout: "Some random output without format columns", stderr: "" });
        return {} as any;
      });

      await expect(import("../../src/core/youtube.js").then(m => m.verifyYoutubeAccess(mockConfig))).rejects.toThrow("YouTube formats not found in response.");
    });

    it("throws specific error for bot detection", async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        // In the catch block of execYtDlp, it uses `error.stderr` not the second argument to the callback.
        // wait, we mock `execFileAsync`, so it uses `util.promisify`.
        // A promisified execFile throws an error object that contains stdout/stderr.
        const err: any = new Error("Fail");
        err.stderr = "Sign in to confirm you are not a bot";
        if (typeof cb === "function") cb(err, { stdout: "", stderr: err.stderr });
        return {} as any;
      });

      await expect(import("../../src/core/youtube.js").then(m => m.verifyYoutubeAccess(mockConfig))).rejects.toThrow("YouTube is blocking this environment (Bot Detection). Update your YOUTUBE_COOKIES_BASE64.");
    });

    it("throws specific error for no formats found block", async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        const err: any = new Error("Fail");
        err.stderr = "no video formats found";
        if (typeof cb === "function") cb(err, { stdout: "", stderr: err.stderr });
        return {} as any;
      });

      await expect(import("../../src/core/youtube.js").then(m => m.verifyYoutubeAccess(mockConfig))).rejects.toThrow("YouTube is blocking streaming access from this IP. (No formats found).");
    });

    it("throws generic error line on generic failure", async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        const err: any = new Error("Fail");
        err.stderr = "ERROR: Some unknown failure occurred\nOther line";
        if (typeof cb === "function") cb(err, { stdout: "", stderr: err.stderr });
        return {} as any;
      });

      await expect(import("../../src/core/youtube.js").then(m => m.verifyYoutubeAccess(mockConfig))).rejects.toThrow("YouTube access check failed: ERROR: Some unknown failure occurred");
    });
  });

  describe("handling non-number duration", () => {
    const mockOutput = {
      id: "vid1",
      duration: "invalid",
    };

    beforeEach(() => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(null, { stdout: JSON.stringify(mockOutput) + "\n", stderr: "" });
        return {} as any;
      });
    });

    it("getVideoInfo handles non-number duration", async () => {
      const info = await getVideoInfo("url");
      expect(info?.duration).toBe(0);
    });

    it("getChannelVideos handles non-number duration", async () => {
      const videos = await getChannelVideos("mychannel", 1);
      expect(videos).toEqual([]);
    });
  });

  it("downloadVideo dynamically selects format when videoIds but no audioIds present", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (args && args.includes("--list-formats")) {
        if (typeof cb === "function") cb(null, { stdout: "ID  EXT   RESOLUTION\n123 mp4   video only", stderr: "" });
      } else {
        if (typeof cb === "function") cb(null, { stdout: "Done", stderr: "" });
      }
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.mp4"] as any);

    const downloaded = await downloadVideo(mockVideoBase, mockConfig);
    expect(downloaded.fileSize).toBe(1024);
  });

  it("downloadVideo dynamically selects combined format when no video only or audio only", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (args && args.includes("--list-formats")) {
        if (typeof cb === "function") cb(null, { stdout: "ID  EXT   RESOLUTION\n123 mp4   combined audio video", stderr: "" });
      } else {
        if (typeof cb === "function") cb(null, { stdout: "Done", stderr: "" });
      }
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.mp4"] as any);

    const downloaded = await downloadVideo(mockVideoBase, mockConfig);
    expect(downloaded.fileSize).toBe(1024);
  });

  it("downloadVideo warns when format output parses but no ids found", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (args && args.includes("--list-formats")) {
        if (typeof cb === "function") cb(null, { stdout: "ID  EXT   RESOLUTION\n123 mhtml storyboard", stderr: "" });
      } else {
        if (typeof cb === "function") cb(null, { stdout: "Done", stderr: "" });
      }
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.mp4"] as any);

    const downloaded = await downloadVideo(mockVideoBase, mockConfig);
    expect(downloaded.fileSize).toBe(1024);
  });

  it("downloadVideo uses default fallback formats", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = typeof options === 'function' ? options : callback;
      if (args && args.includes("--list-formats")) {
        // Mock fail list-formats
        if (typeof cb === "function") cb(new Error("Fail list formats"), { stdout: "", stderr: "" });
      } else {
        if (typeof cb === "function") cb(null, { stdout: "Done", stderr: "" });
      }
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.mp4"] as any);

    const downloaded = await downloadVideo(mockVideoBase, mockConfig);
    expect(downloaded.fileSize).toBe(1024);
  });

  describe("error handling for downloads and sizes", () => {
    it("withCookies logs warning if unlinkSync throws", async () => {
      const confWithCookies = { ...mockConfig, youtubeCookiesBase64: "somebase64" };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw new Error("Cannot delete");
      });

      vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(new Error("Fail channel fetch"), { stdout: "", stderr: "err" });
        return {} as any;
      });

      await getVideoFileSize("url", confWithCookies);
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it("downloadVideo fails when all formats fail", async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(new Error("Fail download"), { stdout: "", stderr: "" });
        return {} as any;
      });

      await expect(downloadVideo(mockVideoBase, mockConfig)).rejects.toThrow("Failed to download video after trying all formats. Last error: Fail download");
    });

    it("downloadVideo fails if video file not found after success", async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(null, { stdout: "Done", stderr: "" });
        return {} as any;
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
      vi.mocked(fs.readdirSync).mockReturnValue(["vid1.wav", "vid1.txt"] as any);

      // The download succeeds in yt-dlp, but no mp4/video file exists in readdirSync
      // It loops formats, and eventually fails
      await expect(downloadVideo(mockVideoBase, mockConfig)).rejects.toThrow("Failed to download video after trying all formats.");
    });

    it("downloadVideo fails if yt-dlp succeeds but file missing later", async () => {
      // Simulate file exists during download check, but disappears before readdir
      let callCount = 0;
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return ["vid1.mp4"] as any; // passes hasVideo check
        return [] as any; // fails videoFileName check
      });

      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(null, { stdout: "Done", stderr: "" });
        return {} as any;
      });

      await expect(downloadVideo(mockVideoBase, mockConfig)).rejects.toThrow("Downloaded video file not found in output directory");
    });

    it("getVideoFileSize handles non-number sizes gracefully", async () => {
      vi.mocked(execFile).mockImplementation((file, args, options, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(null, { stdout: "invalid\n", stderr: "" });
        return {} as any;
      });

      const size = await getVideoFileSize("url", mockConfig);
      expect(size).toBeNull();
    });
  });
});
