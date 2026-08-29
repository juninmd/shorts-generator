import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyYoutubeAccess, getVideoInfo, getVideoFileSize } from "../../src/core/youtube-info.js";
import { execYtDlp } from "../../src/core/youtube-ytdlp.js";

vi.mock("../../src/core/youtube-ytdlp.js", () => ({
  getYtDlpBaseArgs: vi.fn(() => []),
  withCookies: vi.fn(async (config, fn) => fn("cookie.txt")),
  execYtDlp: vi.fn(),
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe("youtube-info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyYoutubeAccess", () => {
    it("verifyYoutubeAccess parses formats successfully", async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: "ID EXT", stderr: "" });
      await expect(verifyYoutubeAccess({} as any)).resolves.not.toThrow();
    });

    it("verifyYoutubeAccess throws if missing formats", async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: "no columns", stderr: "" });
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow("YouTube formats not found");
    });

    it("verifyYoutubeAccess throws specific error on bot detection", async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error("sign in to confirm you are not a bot"));
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow("Update your YOUTUBE_COOKIES_BASE64");
    });

    it("verifyYoutubeAccess throws specific error on no formats found", async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error("no video formats found"));
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow("YouTube is blocking streaming access");
    });

    it("verifyYoutubeAccess extracts error line", async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error("Random \nERROR: This is a test\n error"));
      await expect(verifyYoutubeAccess({} as any)).rejects.toThrow("YouTube access check failed: ERROR: This is a test");
    });
  });

  describe("getVideoInfo", () => {
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
        live_status: "none",
        categories: ["cat1"],
      };

      vi.mocked(execYtDlp).mockResolvedValue({ stdout: JSON.stringify(mockOutput) + "\n", stderr: "" });

      const info = await getVideoInfo("url");
      expect(info).toBeDefined();
      expect(info?.id).toBe("vid1");
      expect(info?.categories).toEqual(["cat1"]);
    });

    it("getVideoInfo sanitizes NA to null", async () => {
      const mockOutput = '{"id":"vid1","title":"Title","duration":NA}\n';

      vi.mocked(execYtDlp).mockResolvedValue({ stdout: mockOutput, stderr: "" });

      const info = await getVideoInfo("url");
      expect(info).toBeDefined();
      expect(info?.duration).toBe(0);
    });

    it("getVideoInfo throws on empty raw output", async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: "", stderr: "" });

      const info = await getVideoInfo("url");
      expect(info).toBeNull();
    });

    it("getVideoInfo returns null on error", async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error("Fail"));

      const info = await getVideoInfo("url");
      expect(info).toBeNull();
    });
  });

  describe("getVideoFileSize", () => {
    it("getVideoFileSize parses file size", async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: "1024", stderr: "" });
      const size = await getVideoFileSize("url", {} as any);
      expect(size).toBe(1024);
    });

    it("getVideoFileSize handles NA", async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: "NA", stderr: "" });
      const size = await getVideoFileSize("url", {} as any);
      expect(size).toBeNull();
    });

    it("getVideoFileSize handles NaN", async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: "invalid", stderr: "" });
      const size = await getVideoFileSize("url", {} as any);
      expect(size).toBeNull();
    });

    it("getVideoFileSize handles error", async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error("fail"));
      const size = await getVideoFileSize("url", {} as any);
      expect(size).toBeNull();
    });
  });
});
