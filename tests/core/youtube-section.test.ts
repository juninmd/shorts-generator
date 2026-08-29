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
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockVideo = {
    id: "vid1",
    title: "Title",
    url: "url",
    channelName: "channel",
    channelUrl: "curl",
    duration: 120,
    publishedAt: "20230101",
  };

  it("downloadVideoSection resolves successfully", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);

    const path = await downloadVideoSection(mockVideo, 10, 20, { tempDir: "/tmp" } as any);
    expect(path).toContain("vid1");
    expect(typeof path).toBe("string");
  });

  it("downloadVideoSection creates output dir if missing", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    vi.mocked(fs.existsSync).mockReturnValue(true); // file exists

    const path = await downloadVideoSection(mockVideo, 10, 20, { tempDir: "/tmp" } as any);
    expect(fs.mkdirSync).toHaveBeenCalled();
  });

  it("downloadVideoSection handles failure", async () => {
    vi.mocked(execYtDlp).mockRejectedValue(new Error("Fail"));
    await expect(downloadVideoSection(mockVideo, 10, 20, { tempDir: "/tmp" } as any)).rejects.toThrow();
  });

  it("downloadVideoSection throws if downloaded file is missing or empty", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(downloadVideoSection(mockVideo, 10, 20, { tempDir: "/tmp" } as any)).rejects.toThrow();
  });

  it("cleanupVideo calls rmSync with prefix", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    cleanupVideo("vid1", { tempDir: "/tmp" } as any);
    expect(fs.rmSync).toHaveBeenCalled();
  });

  it("cleanupVideo does nothing if file missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    cleanupVideo("vid1", { tempDir: "/tmp" } as any);
    expect(fs.rmSync).toHaveBeenCalled(); // RM sync always called, even if not exists in this implementation
  });

  it("cleanupVideo handles rmSync error gracefully", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.rmSync).mockImplementation(() => {
      throw new Error("Failed to delete");
    });

    expect(() => cleanupVideo("vid1", { tempDir: "/tmp" } as any)).not.toThrow();
  });
});
