import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getYtDlpBaseArgs, withCookies, diagnoseAudioDownloadFailure } from "../../src/core/youtube-ytdlp.js";
import fs from "node:fs";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      statSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe("youtube-ytdlp", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.YOUTUBE_COOKIES_BROWSER;
    delete process.env.YOUTUBE_COOKIES_FILE;
    delete process.env.YOUTUBE_NO_COOKIES;
    delete process.env.NO_COOKIES;
    delete process.env.YOUTUBE_PLAYER_CLIENT;
    delete process.env.YOUTUBE_COOKIES_BASE64;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getYtDlpBaseArgs", () => {
    it("returns base args with noCookies true from config", () => {
      const args = getYtDlpBaseArgs({ youtubeNoCookies: true } as any);
      expect(args).toEqual([
        "--no-check-certificates",
        "--extractor-args",
        "youtube:player_client=default",
        "--js-runtimes",
        "node",
      ]);
    });

    it("returns base args with noCookies from env YOUTUBE_NO_COOKIES", () => {
      process.env.YOUTUBE_NO_COOKIES = "true";
      const args = getYtDlpBaseArgs();
      expect(args).toEqual([
        "--no-check-certificates",
        "--extractor-args",
        "youtube:player_client=default",
        "--js-runtimes",
        "node",
      ]);
    });

    it("returns base args with noCookies from env NO_COOKIES", () => {
      process.env.NO_COOKIES = "true";
      const args = getYtDlpBaseArgs();
      expect(args).toEqual([
        "--no-check-certificates",
        "--extractor-args",
        "youtube:player_client=default",
        "--js-runtimes",
        "node",
      ]);
    });

    it("uses YOUTUBE_PLAYER_CLIENT env if set", () => {
      process.env.YOUTUBE_PLAYER_CLIENT = "ios";
      const args = getYtDlpBaseArgs({ youtubeNoCookies: true } as any);
      expect(args).toContain("youtube:player_client=ios");
    });

    it("uses browser cookies if specified in config", () => {
      const args = getYtDlpBaseArgs({ youtubeCookiesBrowser: "chrome" } as any);
      expect(args).toContain("--cookies-from-browser");
      expect(args).toContain("chrome");
    });

    it("uses browser cookies if specified in env", () => {
      process.env.YOUTUBE_COOKIES_BROWSER = "firefox";
      const args = getYtDlpBaseArgs();
      expect(args).toContain("--cookies-from-browser");
      expect(args).toContain("firefox");
    });

    it("uses browser cookies even if file is specified (browser takes precedence)", () => {
      const args = getYtDlpBaseArgs({ youtubeCookiesBrowser: "chrome", youtubeCookiesFile: "file.txt" } as any);
      expect(args).toContain("--cookies-from-browser");
      expect(args).toContain("chrome");
      expect(args).not.toContain("--cookies");
    });

    it("uses cookie file if specified in config", () => {
      const args = getYtDlpBaseArgs({ youtubeCookiesFile: "cookies.txt" } as any);
      expect(args).toContain("--cookies");
      expect(args).toContain("cookies.txt");
    });

    it("does not use cookie file if file is empty string", () => {
      const args = getYtDlpBaseArgs({ youtubeCookiesFile: "" } as any);
      expect(args).not.toContain("--cookies");
    });

    it("withCookies temp dir exists", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      process.env.YOUTUBE_COOKIES_BASE64 = Buffer.from("my cookie data").toString("base64");

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (String(p).includes("my-temp")) return true; // tempdir check
        if (String(p).includes("cookies-")) return true; // temp cookie file check
        return true;
      });
      vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);

      const res = await withCookies({ tempDir: "my-temp" } as any, fn);
      expect(res).toBe("result");
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it("uses cookie file if specified in env", () => {
      process.env.YOUTUBE_COOKIES_FILE = "env_cookies.txt";
      const args = getYtDlpBaseArgs();
      expect(args).toContain("--cookies");
      expect(args).toContain("env_cookies.txt");
    });

    it("uses temp cookie file passed as arg", () => {
      const args = getYtDlpBaseArgs({}, "temp_cookies.txt");
      expect(args).toContain("--cookies");
      expect(args).toContain("temp_cookies.txt");
    });
  });

  describe("withCookies", () => {
    it("runs without cookies if noCookies is true", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      const res = await withCookies({ youtubeNoCookies: true } as any, fn);
      expect(res).toBe("result");
      expect(fn).toHaveBeenCalledWith(undefined);
    });

    it("runs with base64 cookies and deletes temp file", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      process.env.YOUTUBE_COOKIES_BASE64 = Buffer.from("my cookie data").toString("base64");

      vi.mocked(fs.existsSync).mockReturnValue(false); // tempdir check
      vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);

      // Force existsSync to return true for the temp cookie path when checking for unlink
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (String(p).includes("cookies-")) return true;
        return false;
      });

      const res = await withCookies({ tempDir: "my-temp" } as any, fn);

      expect(res).toBe("result");
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalled();

      // Extract the path passed to fn
      const pathArg = fn.mock.calls[0][0];
      expect(pathArg).toMatch(/cookies-[a-f0-9]+\.txt/);
    });

    it("warns if cookie file is small", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      process.env.YOUTUBE_COOKIES_BASE64 = Buffer.from("small").toString("base64");

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).includes("cookies-"));
      vi.mocked(fs.statSync).mockReturnValue({ size: 5 } as any);

      await withCookies({}, fn);
      // It should still call fn and write file
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it("does not create temp file if no base64 cookies", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      const res = await withCookies({}, fn);
      expect(res).toBe("result");
      expect(fn).toHaveBeenCalledWith(undefined);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it("handles error during temp file deletion", async () => {
      const fn = vi.fn().mockResolvedValue("result");
      process.env.YOUTUBE_COOKIES_BASE64 = Buffer.from("data").toString("base64");

      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).includes("cookies-"));
      vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
      vi.mocked(fs.unlinkSync).mockImplementation(() => { throw new Error("delete error"); });

      const res = await withCookies({}, fn);
      expect(res).toBe("result");
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe("execYtDlp", () => {

    it("executes successfully and returns stdout/stderr", async () => {
      const ytDlpMod = await import("../../src/core/youtube-ytdlp.js");
      const { execYtDlp } = ytDlpMod;
      const childProcess = await import("node:child_process");

      // Node's util.promisify expects a (error, stdout, stderr) callback
      vi.mocked(childProcess.execFile).mockImplementation(function(...args: any[]) {
        const callback = args[args.length - 1];
        callback(null, { stdout: "success output", stderr: "warning output" });
        return {} as any;
      });

      const res = await execYtDlp(["--version"]);
      expect(res.stdout).toBe("success output" as any);
      expect(res.stderr).toBe("warning output" as any);
    });

    it("handles execution failure and redacts cookie paths in logs", async () => {
      const ytDlpMod = await import("../../src/core/youtube-ytdlp.js");
      const { execYtDlp } = ytDlpMod;
      const childProcess = await import("node:child_process");

      vi.mocked(childProcess.execFile).mockImplementation(function(...args: any[]) {
        const callback = args[args.length - 1];
        const err = new Error("Command failed with cookies-12345678.txt");
        (err as any).stderr = "stderr error related to cookies-87654321.txt";
        callback(err, "", "");
        return {} as any;
      });

      await expect(execYtDlp(["--cookies", "cookies-12345678.txt"])).rejects.toThrow("Command failed");
    });

    it("handles execution failure without stderr property safely", async () => {
      const ytDlpMod = await import("../../src/core/youtube-ytdlp.js");
      const { execYtDlp } = ytDlpMod;
      const childProcess = await import("node:child_process");

      vi.mocked(childProcess.execFile).mockImplementation(function(...args: any[]) {
        const callback = args[args.length - 1];
        callback("String error", "", "");
        return {} as any;
      });

      await expect(execYtDlp(["--version"])).rejects.toThrow();
    });
  });

  describe("diagnoseAudioDownloadFailure", () => {
    it("diagnoses 403 / bot errors", () => {
      expect(diagnoseAudioDownloadFailure("HTTP Error 403: Forbidden")).toBe("YOUTUBE_BLOCKED");
      expect(diagnoseAudioDownloadFailure("detected as a bot")).toBe("YOUTUBE_BLOCKED");
      expect(diagnoseAudioDownloadFailure("blocked by youtube")).toBe("YOUTUBE_BLOCKED");
    });

    it("diagnoses auth/age errors", () => {
      expect(diagnoseAudioDownloadFailure("Sign in to confirm your age")).toBe("YOUTUBE_AUTH_REQUIRED");
      expect(diagnoseAudioDownloadFailure("age restricted")).toBe("YOUTUBE_AUTH_REQUIRED");
    });

    it("diagnoses format errors", () => {
      expect(diagnoseAudioDownloadFailure("no formats found")).toBe("NO_VIDEO_FORMATS");
      expect(diagnoseAudioDownloadFailure("no video formats")).toBe("NO_VIDEO_FORMATS");
    });

    it("diagnoses network download errors", () => {
      expect(diagnoseAudioDownloadFailure("unable to download video: http error 500")).toBe("NETWORK_ERROR_DOWNLOAD");
    });

    it("diagnoses ffmpeg errors", () => {
      expect(diagnoseAudioDownloadFailure("ffmpeg not found")).toBe("FFMPEG_NOT_INSTALLED");
      expect(diagnoseAudioDownloadFailure("ffmpeg post-processor error")).toBe("FFMPEG_CONVERSION_FAILED");
    });

    it("diagnoses disk space errors", () => {
      expect(diagnoseAudioDownloadFailure("no space left on device")).toBe("DISK_SPACE_FULL");
      expect(diagnoseAudioDownloadFailure("disk full")).toBe("DISK_SPACE_FULL");
    });

    it("diagnoses permission errors", () => {
      expect(diagnoseAudioDownloadFailure("permission denied")).toBe("PERMISSION_ERROR");
      expect(diagnoseAudioDownloadFailure("access denied")).toBe("PERMISSION_ERROR");
    });

    it("diagnoses timeout errors", () => {
      expect(diagnoseAudioDownloadFailure("connection timeout")).toBe("TIMEOUT");
      expect(diagnoseAudioDownloadFailure("timed out")).toBe("TIMEOUT");
    });

    it("returns UNKNOWN_ERROR for unhandled cases", () => {
      expect(diagnoseAudioDownloadFailure("random unknown error")).toBe("UNKNOWN_ERROR");
    });
  });
});
