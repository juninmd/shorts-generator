import { describe, it, expect, vi } from "vitest";
import { downloadAudioOnly } from "../../src/core/youtube-download.js";
import { execYtDlp } from "../../src/core/youtube-ytdlp.js";
import type { VideoInfo, SystemConfig } from "../../src/types.js";
import fs from "node:fs";

vi.mock("../../src/core/youtube-ytdlp.js", () => ({
  execYtDlp: vi.fn(),
  withCookies: vi.fn(async (_opts, cb) => cb("/tmp/cookies.txt")),
  getYtDlpBaseArgs: vi.fn(() => ["--cookies", "/tmp/cookies.txt"]),
  diagnoseAudioDownloadFailure: vi.fn(() => "mock_stage")
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      statSync: vi.fn().mockReturnValue({ size: 1024 }),
      readdirSync: vi.fn().mockReturnValue(["vid1.mp4"]),
      mkdirSync: vi.fn()
    },
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({ size: 1024 }),
    readdirSync: vi.fn().mockReturnValue(["vid1.mp4"]),
    mkdirSync: vi.fn()
  };
});

const mockConfig: SystemConfig = {
  id: "test",
  youtubeClientEmail: "test@test.com",
  youtubePrivateKey: "key",
  geminiApiKey: "key",
  geminiModel: "model",
  videoLanguage: "pt",
  workingDirectory: "/tmp",
  verticalWidth: 1080,
  verticalHeight: 1920,
  maxConcurrentJobs: 1,
  dbPath: ":memory:",
  enableExperimental: false,
  telegramBotToken: "token",
  telegramChatId: "chatId",
  telegramAdminIds: "admin",
  cookieMode: "none",
  cloudGeminiApiKey: "",
  tempDir: "/tmp"
};

describe("youtube-download", () => {
  it("downloadAudioOnly works", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    const video: VideoInfo = {
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

  it("downloadAudioOnly warns on small size", async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stdout: "Done", stderr: "" });
    vi.mocked(fs.statSync).mockReturnValueOnce({ size: 500 } as any);
    const video: VideoInfo = {
      id: "vid1",
      title: "Title",
      url: "url",
      channelName: "channel",
      channelUrl: "curl",
      duration: 120,
      publishedAt: "20230101",
    };
    const downloaded = await downloadAudioOnly(video, mockConfig);
    expect(downloaded.fileSize).toBe(500);
  });

  it("downloadAudioOnly handles yt-dlp error", async () => {
      vi.mocked(execYtDlp).mockRejectedValueOnce(new Error("Failed"));
      const video: VideoInfo = {
          id: "vid1",
          title: "Title",
          url: "url",
          channelName: "channel",
          channelUrl: "curl",
          duration: 120,
          publishedAt: "20230101",
      };
      await expect(downloadAudioOnly(video, mockConfig)).rejects.toThrow(/AUDIO DOWNLOAD FAILED/);
  });

  it("downloadAudioOnly handles yt-dlp error string", async () => {
      vi.mocked(execYtDlp).mockRejectedValueOnce("String error");
      const video: VideoInfo = {
          id: "vid1",
          title: "Title",
          url: "url",
          channelName: "channel",
          channelUrl: "curl",
          duration: 120,
          publishedAt: "20230101",
      };
      await expect(downloadAudioOnly(video, mockConfig)).rejects.toThrow(/AUDIO DOWNLOAD FAILED/);
  });

  it("downloadAudioOnly handles missing file and diagnostic logs (unknown stage)", async () => {
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: "Done", stderr: "some error" });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      const video: VideoInfo = {
          id: "vid1",
          title: "Title",
          url: "url",
          channelName: "channel",
          channelUrl: "curl",
          duration: 120,
          publishedAt: "20230101",
      };
      await expect(downloadAudioOnly(video, mockConfig)).rejects.toThrow(/AUDIO EXTRACTION FAILED/);
  });

  it("downloadAudioOnly diagnostics download_video_stream stage", async () => {
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: "Done", stderr: "ERROR: stream failed" });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      const video: VideoInfo = {
          id: "vid1",
          title: "Title",
          url: "url",
          channelName: "channel",
          channelUrl: "curl",
          duration: 120,
          publishedAt: "20230101",
      };
      await expect(downloadAudioOnly(video, mockConfig)).rejects.toThrow(/AUDIO EXTRACTION FAILED/);
  });

  it("downloadAudioOnly diagnostics ffmpeg_audio_extraction stage", async () => {
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: "Done", stderr: "Post-processor failed" });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      const video: VideoInfo = {
          id: "vid1",
          title: "Title",
          url: "url",
          channelName: "channel",
          channelUrl: "curl",
          duration: 120,
          publishedAt: "20230101",
      };
      await expect(downloadAudioOnly(video, mockConfig)).rejects.toThrow(/AUDIO EXTRACTION FAILED/);
  });

  it("downloadAudioOnly diagnostics ffmpeg stage", async () => {
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: "Done", stderr: "ffmpeg failed" });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      const video: VideoInfo = {
          id: "vid1",
          title: "Title",
          url: "url",
          channelName: "channel",
          channelUrl: "curl",
          duration: 120,
          publishedAt: "20230101",
      };
      await expect(downloadAudioOnly(video, mockConfig)).rejects.toThrow(/AUDIO EXTRACTION FAILED/);
  });

  it("downloadAudioOnly diagnostics warning stage", async () => {
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: "Done", stderr: "WARNING" });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);
      const video: VideoInfo = {
          id: "vid1",
          title: "Title",
          url: "url",
          channelName: "channel",
          channelUrl: "curl",
          duration: 120,
          publishedAt: "20230101",
      };
      await expect(downloadAudioOnly(video, mockConfig)).rejects.toThrow(/AUDIO EXTRACTION FAILED/);
  });
});
