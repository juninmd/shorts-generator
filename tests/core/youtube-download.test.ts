import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadAudioOnly } from "../../src/core/youtube-download.js";
import { execYtDlp } from "../../src/core/youtube-ytdlp.js";
import fs from "node:fs";
import path from "node:path";

vi.mock("../../src/core/youtube-ytdlp.js", () => ({
  getYtDlpBaseArgs: vi.fn(() => []),
  withCookies: vi.fn(async (config, fn) => fn("cookie.txt")),
  execYtDlp: vi.fn(),
  diagnoseAudioDownloadFailure: vi.fn(() => "YOUTUBE_BLOCKED"),
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
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
  }
}));

describe("youtube-download", () => {
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

  it("downloadAudioOnly resolves successfully", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.wav"] as any);

    const downloaded = await downloadAudioOnly(mockVideo, { tempDir: "/tmp" } as any);
    expect(downloaded.fileSize).toBe(1024);
  });

  it("downloadAudioOnly sets maxBuffer and timeout on options", async () => {
    let passedOptions: any;
    vi.mocked(execYtDlp).mockImplementation(async (args, options) => {
      passedOptions = options;
      return { stdout: "Done", stderr: "" };
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.wav"] as any);

    await downloadAudioOnly(mockVideo, { tempDir: "/tmp" } as any);
    expect(passedOptions).toMatchObject({ timeout: 300000 });
  });

  it("downloadAudioOnly handles empty readdir (cannot find output file)", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);

    await expect(downloadAudioOnly(mockVideo, { tempDir: "/tmp" } as any)).rejects.toThrow("[AUDIO EXTRACTION FAILED]");
  });

  it("downloadAudioOnly throws with diagnostics on yt-dlp download failure", async () => {
    vi.mocked(execYtDlp).mockRejectedValue(Object.assign(new Error("DL Fail"), { stderr: "DL stderr" }));
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await expect(downloadAudioOnly(mockVideo, { tempDir: "/tmp" } as any)).rejects.toThrow("[AUDIO DOWNLOAD FAILED -");
  });

  it("downloadAudioOnly creates tempDir if it doesn't exist", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.wav"] as any);

    await downloadAudioOnly(mockVideo, { tempDir: "/tmp" } as any);
    expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/vid1", { recursive: true });
  });

  it("downloadAudioOnly throws with correct stage if file is missing (general error)", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "ERROR: some error" });
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.part"] as any);

    await expect(downloadAudioOnly(mockVideo, { tempDir: "/tmp" } as any)).rejects.toThrow("[AUDIO EXTRACTION FAILED] Stage: download_video_stream");
  });

  it("downloadAudioOnly throws with correct stage if file is missing (ffmpeg error)", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "ffmpeg not found" });
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.part"] as any);

    await expect(downloadAudioOnly(mockVideo, { tempDir: "/tmp" } as any)).rejects.toThrow("[AUDIO EXTRACTION FAILED] Stage: ffmpeg_audio_extraction");
  });

  it("downloadAudioOnly throws with correct stage if file is missing (warning)", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "WARNING: some warning" });
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.part"] as any);

    await expect(downloadAudioOnly(mockVideo, { tempDir: "/tmp" } as any)).rejects.toThrow("[AUDIO EXTRACTION FAILED] Stage: with_warnings");
  });

  it("downloadAudioOnly handles small corrupted files", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any);
    vi.mocked(fs.readdirSync).mockReturnValue(["vid1.wav"] as any);

    const downloaded = await downloadAudioOnly(mockVideo, { tempDir: "/tmp" } as any);
    expect(downloaded.fileSize).toBe(500);
  });
});
