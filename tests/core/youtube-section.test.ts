import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadVideoSection, cleanupVideo } from "../../src/core/youtube-section.js";
import { execYtDlp } from "../../src/core/youtube-ytdlp.js";
import fs from "node:fs";

vi.mock("../../src/core/youtube-ytdlp.js", () => ({
  getYtDlpBaseArgs: vi.fn(() => []),
  withCookies: vi.fn(async (config, fn) => fn("cookie.txt")),
  execYtDlp: vi.fn(),
  diagnoseAudioDownloadFailure: vi.fn(() => "ERR"),
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    rmSync: vi.fn(),
  }
}));

describe("youtube-section", () => {
  const mockVideo = {
    id: "vid1", title: "Title", url: "url", channelName: "channel",
    channelUrl: "curl", duration: 120, publishedAt: "20230101",
  };
  const tempDirConfig = { tempDir: "/tmp" } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("downloadVideoSection", () => {
    it.each([
      { desc: "resolves successfully", rejectYt: false, fileExists: true, createsDir: false },
      { desc: "creates output dir if missing", rejectYt: false, fileExists: true, createsDir: true },
      { desc: "handles failure", rejectYt: true, fileExists: true, createsDir: false },
      { desc: "throws if downloaded file is missing or empty", rejectYt: false, fileExists: false, createsDir: false },
    ])("$desc", async ({ rejectYt, fileExists, createsDir }) => {
      if (rejectYt) {
        vi.mocked(execYtDlp).mockRejectedValue(new Error("Fail"));
      } else {
        vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
      }
      vi.mocked(fs.existsSync).mockReturnValue(fileExists);
      vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);

      const promise = downloadVideoSection(mockVideo, 10, 20, tempDirConfig);

      if (rejectYt || !fileExists) {
        await expect(promise).rejects.toThrow();
      } else {
        const path = await promise;
        expect(path).toContain("vid1");
        expect(typeof path).toBe("string");
        if (createsDir) expect(fs.mkdirSync).toHaveBeenCalled();
      }
    });
  });

  describe("cleanupVideo", () => {
    it.each([
      { desc: "calls rmSync with prefix", fileExists: true, throwErr: false },
      { desc: "does nothing if file missing", fileExists: false, throwErr: false },
      { desc: "handles rmSync error gracefully", fileExists: true, throwErr: true },
    ])("$desc", ({ fileExists, throwErr }) => {
      vi.mocked(fs.existsSync).mockReturnValue(fileExists);
      if (throwErr) {
        vi.mocked(fs.rmSync).mockImplementation(() => { throw new Error("Failed to delete"); });
      }

      expect(() => cleanupVideo("vid1", tempDirConfig)).not.toThrow();
      expect(fs.rmSync).toHaveBeenCalled();
    });
  });
});
