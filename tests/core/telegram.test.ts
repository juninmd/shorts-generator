import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendToTelegram, sendSummary, sendFullVideoToTelegram } from "../../src/core/telegram.js";
import type { GeneratedShort, PipelineConfig, ShortClip, DownloadedVideo } from "../../src/types.js";
import { InputFile } from "grammy";
import fs from "node:fs";

vi.mock("node:fs", () => ({
  default: {
    statSync: vi.fn(),
  },
}));

const mockSendVideo = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("grammy", () => {
  return {
    Bot: vi.fn().mockImplementation(function () {
      return {
        api: {
          sendVideo: mockSendVideo,
          sendMessage: mockSendMessage,
        },
      };
    }),
    InputFile: vi.fn(),
  };
});

describe("telegram", () => {
  const mockConfig: PipelineConfig = {
    telegramBotToken: "dummy",
    telegramChatId: "12345",
  } as PipelineConfig;

  const mockShort: GeneratedShort = {
    id: "short1",
    clip: { title: "Title", description: "Desc", hashtags: ["#tag"] } as ShortClip,
    outputPath: "path.mp4",
    subtitlePath: "path.ass",
    originalVideoUrl: "url",
    originalVideoTitle: "Vid Title",
    channelName: "Channel",
    status: "completed",
    createdAt: "now",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not send if bot key or chatId are missing", async () => {
    const emptyConfig = { ...mockConfig, telegramBotToken: "" };
    const result = await sendToTelegram(mockShort, emptyConfig);
    expect(result).toBeUndefined();
    expect(mockSendVideo).not.toHaveBeenCalled();
  });

  it("should send video and return message id", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 123 });
    const result = await sendToTelegram(mockShort, mockConfig, "https://youtube.com/xyz");

    expect(mockSendVideo).toHaveBeenCalledTimes(1);
    expect(result).toBe(123);
  });

  it("should send text message if video is too large", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 60 * 1024 * 1024 } as any);
    mockSendMessage.mockResolvedValue({ message_id: 999 });
    const result = await sendToTelegram(mockShort, mockConfig);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(result).toBe(999);
  });

  it("should send summary successfully", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 124 });
    await sendSummary("Title", "Channel", 2, ["error1", "error2", "error3", "error4", "error5", "error6"], mockConfig);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("should not send summary if missing bot key or chatId", async () => {
    const emptyConfig = { ...mockConfig, telegramBotToken: "" };
    await sendSummary("Title", "Channel", 2, [], emptyConfig);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("sendFullVideoToTelegram should not send if bot key or chatId missing", async () => {
    const emptyConfig = { ...mockConfig, telegramBotToken: "" };
    const result = await sendFullVideoToTelegram({} as DownloadedVideo, emptyConfig);
    expect(result).toBeUndefined();
    expect(mockSendVideo).not.toHaveBeenCalled();
  });

  it("sendFullVideoToTelegram should send video and return message id", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 125 });
    const video: DownloadedVideo = {
      id: "vid1", title: "Vid", duration: 100, channelName: "Chan", url: "url", filePath: "path.mp4", viewCount: 1000
    } as DownloadedVideo;
    const result = await sendFullVideoToTelegram(video, mockConfig, "yt-url");

    expect(mockSendVideo).toHaveBeenCalledTimes(1);
    expect(result).toBe(125);
  });

  it("sendFullVideoToTelegram should send text message if video is too large", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 60 * 1024 * 1024 } as any);
    mockSendMessage.mockResolvedValue({ message_id: 126 });
    const video: DownloadedVideo = {
      id: "vid1", title: "Vid", duration: 100, channelName: "Chan", url: "url", filePath: "path.mp4", viewCount: 1000
    } as DownloadedVideo;
    const result = await sendFullVideoToTelegram(video, mockConfig);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(result).toBe(126);
  });

  it("sendFullVideoToTelegram should handle error gracefully", async () => {
    vi.mocked(fs.statSync).mockImplementation(() => { throw new Error("FS Error"); });
    const video: DownloadedVideo = {
      id: "vid1", title: "Vid", duration: 100, channelName: "Chan", url: "url", filePath: "path.mp4"
    } as DownloadedVideo;
    const result = await sendFullVideoToTelegram(video, mockConfig);

    expect(result).toBeUndefined();
  });

  it("sendToTelegram should handle error gracefully", async () => {
    vi.mocked(fs.statSync).mockImplementation(() => { throw new Error("FS Error"); });
    const result = await sendToTelegram(mockShort, mockConfig);
    expect(result).toBeUndefined();
  });

  it("sendSummary should handle error gracefully", async () => {
    mockSendMessage.mockRejectedValue(new Error("Telegram failed"));
    await sendSummary("Title", "Channel", 2, ["error1"], mockConfig);
    expect(mockSendMessage).toHaveBeenCalled();
  });
});
