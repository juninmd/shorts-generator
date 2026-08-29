import { describe, it, expect, vi, beforeEach } from "vitest";
import { getYtDlpBaseArgs, withCookies, execYtDlp, diagnoseAudioDownloadFailure } from "../../src/core/youtube-ytdlp.js";
import { execFile } from "node:child_process";
import fs from "node:fs";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
  }
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe("youtube-ytdlp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.YOUTUBE_NO_COOKIES;
    delete process.env.NO_COOKIES;
    delete process.env.YOUTUBE_COOKIES_BROWSER;
    delete process.env.YOUTUBE_COOKIES_FILE;
    delete process.env.YOUTUBE_COOKIES_BASE64;
  });

  describe("getYtDlpBaseArgs", () => {
    it("getYtDlpBaseArgs returns correct base args", () => {
      const args = getYtDlpBaseArgs();
      expect(args).toContain("--no-check-certificates");
    });

    it("getYtDlpBaseArgs handles browser cookies", () => {
      const args = getYtDlpBaseArgs({ youtubeCookiesBrowser: "chrome" } as any);
      expect(args).toContain("--cookies-from-browser");
      expect(args).toContain("chrome");
    });

    it("getYtDlpBaseArgs handles file cookies", () => {
      const args = getYtDlpBaseArgs({ youtubeCookiesFile: "cookies.txt" } as any);
      expect(args).toContain("--cookies");
      expect(args).toContain("cookies.txt");
    });

    it("getYtDlpBaseArgs handles noCookies flag", () => {
      const args = getYtDlpBaseArgs({ youtubeNoCookies: true } as any);
      expect(args).not.toContain("--cookies");
      expect(args).not.toContain("--cookies-from-browser");
    });
  });

  describe("withCookies", () => {
    it("withCookies handles noCookies flag", async () => {
      await withCookies({ youtubeNoCookies: true } as any, async (p) => {
        expect(p).toBeUndefined();
      });
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("withCookies handles base64 cookies and cleans up", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
      let path = "";
      await withCookies({ youtubeCookiesBase64: "base64" } as any, async (p) => {
        path = p || "";
      });
      expect(path).toContain("cookies");
      expect(fs.unlinkSync).toHaveBeenCalledWith(path);
    });

    it("withCookies creates temp dir if needed", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false); // simulates dir missing, then file missing in cleanup
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
      await withCookies({ youtubeCookiesBase64: "base64" } as any, async () => {});
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it("withCookies handles base64 cookies small size warning", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 5 } as any);
      await withCookies({ youtubeCookiesBase64: "base64" } as any, async () => {});
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it("withCookies handles fs.unlinkSync error", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
      vi.mocked(fs.unlinkSync).mockImplementation(() => { throw new Error("err"); });
      await expect(withCookies({ youtubeCookiesBase64: "base64" } as any, async () => {})).resolves.not.toThrow();
    });
  });

  describe("execYtDlp", () => {
    it("execYtDlp resolves successfully", async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(null, { stdout: "Done", stderr: "" });
        return {} as any;
      });

      const res = await execYtDlp(["arg"]);
      expect(res.stdout).toBe("Done");
    });

    it("execYtDlp handles error and redacts cookie path", async () => {
      vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (typeof cb === "function") cb(Object.assign(new Error("Fail in cookies-1234.txt"), { stderr: "err cookies-1234.txt" }), { stdout: "", stderr: "" });
        return {} as any;
      });

      await expect(execYtDlp(["--cookies", "cookies-1234.txt"])).rejects.toThrow();
    });
  });

  describe("diagnoseAudioDownloadFailure", () => {
    it("diagnoseAudioDownloadFailure works for all conditions", () => {
      expect(diagnoseAudioDownloadFailure("403 error")).toBe("YOUTUBE_BLOCKED");
      expect(diagnoseAudioDownloadFailure("please sign in to prove")).toBe("YOUTUBE_AUTH_REQUIRED");
      expect(diagnoseAudioDownloadFailure("no video formats found")).toBe("NO_VIDEO_FORMATS");
      expect(diagnoseAudioDownloadFailure("unable to download http resource")).toBe("NETWORK_ERROR_DOWNLOAD");
      expect(diagnoseAudioDownloadFailure("ffmpeg not found")).toBe("FFMPEG_NOT_INSTALLED");
      expect(diagnoseAudioDownloadFailure("post-processor failed")).toBe("FFMPEG_CONVERSION_FAILED");
      expect(diagnoseAudioDownloadFailure("disk full")).toBe("DISK_SPACE_FULL");
      expect(diagnoseAudioDownloadFailure("permission denied")).toBe("PERMISSION_ERROR");
      expect(diagnoseAudioDownloadFailure("timed out reading")).toBe("TIMEOUT");
      expect(diagnoseAudioDownloadFailure("random error")).toBe("UNKNOWN_ERROR");
    });
  });
});
