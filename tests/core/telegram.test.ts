import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendToTelegram, sendSummary } from "../../src/core/telegram.js";
import type { GeneratedShort, PipelineConfig, ShortClip } from "../../src/types.js";
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
    telegramBotToken: "token",
    telegramChatId: "chat_id",
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

  it("should not send if token or chatId are missing", async () => {
    const emptyConfig = { ...mockConfig, telegramBotToken: "" };
    const result = await sendToTelegram(mockShort, emptyConfig);
    expect(result).toBeUndefined();
    expect(mockSendVideo).not.toHaveBeenCalled();
  });

  it("should send video and return message id", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 123 });
    const result = await sendToTelegram(mockShort, mockConfig);

    expect(mockSendVideo).toHaveBeenCalledTimes(1);
    expect(result).toBe(123);
  });

  it("should include the presenter name in caption and title", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 321 });
    const withPresenter: GeneratedShort = {
      ...mockShort,
      clip: { title: "O segredo da fé", description: "Desc", hashtags: ["#tag"], presenter: "Padre Paulo" } as ShortClip,
    };
    await sendToTelegram(withPresenter, mockConfig);

    const caption = mockSendVideo.mock.calls[0][2].caption as string;
    expect(caption).toContain("Padre Paulo: O segredo da fé");
    expect(caption).toContain("Apresentador:");
    expect(caption).toContain("Padre Paulo");
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
    await sendSummary("Title", "Channel", 2, [], mockConfig);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("should not send summary if missing token or chatId", async () => {
    const emptyConfig = { ...mockConfig, telegramBotToken: "" };
    await sendSummary("Title", "Channel", 2, [], emptyConfig);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("should format tags preview with null elements", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubePublished } = await import("../../src/core/telegram.js");
    await notifyYoutubePublished({ videoId: "v", url: "u", title: "t", isShort: true, tags: ["a", null, "b"] as any }, mockConfig);
  });

  it("should format daily-cap without limit", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubeRateLimited } = await import("../../src/core/telegram.js");
    await notifyYoutubeRateLimited({ channelName: null, reason: "daily-cap" }, { ...mockConfig, telegramBotToken: "token", telegramChatId: "chat_id" } as any);
  });

  it("should send resumed without channelName", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubeResumed } = await import("../../src/core/telegram.js");
    await notifyYoutubeResumed(null, mockConfig);
  });

  it("should send short with long caption string", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 111 });
    const { sendToTelegram } = await import("../../src/core/telegram.js");
    const mShort = {
      ...mockShort,
      clip: { title: "a".repeat(1500), description: "Desc", hashtags: ["tag"] } as ShortClip,
    };
    await sendToTelegram(mShort, mockConfig);
  });

  it("should send summary with extremely long errors", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { sendSummary } = await import("../../src/core/telegram.js");
    await sendSummary("title", "ch", 1, ["a".repeat(500)], mockConfig);
  });

  it("should send notifyYoutubePublished successfully", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubePublished } = await import("../../src/core/telegram.js");
    await notifyYoutubePublished({ videoId: "v", url: "u", title: "t", channelName: "c", isShort: true, tags: ["t1", "t2"], description: "desc" }, mockConfig);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][1]).toContain("SHORT PUBLICADO NO YOUTUBE");
  });

  it("should send notifyYoutubePublished for normal video and handle long descriptions", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubePublished } = await import("../../src/core/telegram.js");
    await notifyYoutubePublished({ videoId: "v", url: "u", title: "t", channelName: "", isShort: false, description: "a".repeat(200) }, mockConfig);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][1]).toContain("VÍDEO PUBLICADO NO YOUTUBE");
    expect(mockSendMessage.mock.calls[0][1]).toContain("a".repeat(177) + "...");
  });

  it("should not send notifyYoutubePublished if config missing", async () => {
    const { notifyYoutubePublished } = await import("../../src/core/telegram.js");
    await notifyYoutubePublished({ videoId: "v", url: "u", title: "t", isShort: true }, { ...mockConfig, telegramBotToken: "" } as any);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("should handle error in notifyYoutubePublished gracefully", async () => {
    mockSendMessage.mockRejectedValue(new Error("Net fail"));
    const { notifyYoutubePublished } = await import("../../src/core/telegram.js");
    await notifyYoutubePublished({ videoId: "v", url: "u", title: "t", isShort: true }, { ...mockConfig, retryBaseDelayMs: 1, retryMaxAttempts: 1 } as any);
  });

  it("should format tags preview properly", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubePublished } = await import("../../src/core/telegram.js");
    const tags = Array.from({length: 15}).map((_, i) => "tag" + i);
    await notifyYoutubePublished({ videoId: "v", url: "u", title: "t", isShort: true, tags }, mockConfig);
    expect(mockSendMessage.mock.calls[0][1]).toContain("(+3)");
  });

  it("should escape HTML properly in title for missing text", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubePublished } = await import("../../src/core/telegram.js");
    await notifyYoutubePublished({ videoId: "v", url: "u", title: "", isShort: true }, mockConfig);
    expect(mockSendMessage.mock.calls[0][1]).toContain("<b></b>");
  });

  it("should send notifyYoutubePublished without description and channelName", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubePublished } = await import("../../src/core/telegram.js");
    await notifyYoutubePublished({ videoId: "v", url: "u", title: "t", isShort: true }, mockConfig);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("should truncate very long error message", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { sendErrorAlert } = await import("../../src/core/telegram.js");
    await sendErrorAlert("t", "e".repeat(2000), mockConfig);
  });

  it("should truncate long stack trace", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { sendErrorAlert } = await import("../../src/core/telegram.js");
    const e = new Error("hi");
    e.stack = "s".repeat(2000);
    await sendErrorAlert("t", e, mockConfig);
  });

  it("should send video message without presenter", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 111 });
    const { sendToTelegram } = await import("../../src/core/telegram.js");
    const mShort = {
      ...mockShort,
      clip: { title: "Title", description: "Desc", hashtags: ["tag"] } as ShortClip,
    };
    await sendToTelegram(mShort, mockConfig);
  });

  it("should format viewCount correctly", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 333 });
    const { sendFullVideoToTelegram } = await import("../../src/core/telegram.js");
    const video = { id: "v1", title: "Video", duration: 120, channelName: "Channel", url: "url", filePath: "path.mp4", viewCount: 1234567 } as any;
    const res = await sendFullVideoToTelegram(video, mockConfig, null);
  });

  it("should not format viewCount if missing", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 333 });
    const { sendFullVideoToTelegram } = await import("../../src/core/telegram.js");
    const video = { id: "v1", title: "Video", duration: 120, channelName: "Channel", url: "url", filePath: "path.mp4" } as any;
    const res = await sendFullVideoToTelegram(video, mockConfig, null);
  });

  it("should send rate limit alert successfully", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubeRateLimited } = await import("../../src/core/telegram.js");
    await notifyYoutubeRateLimited({ channelName: "Test Channel", reason: "youtube-quota" }, { ...mockConfig, telegramBotToken: "token", telegramChatId: "chat_id" } as any);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][1]).toContain("UPLOADS DO YOUTUBE PAUSADOS");
  });

  it("should send resume alert successfully", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 222 });
    const { notifyYoutubeResumed } = await import("../../src/core/telegram.js");
    await notifyYoutubeResumed("Test Channel", mockConfig);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][1]).toContain("UPLOADS DO YOUTUBE RETOMADOS");
  });

  it("should send full video successfully", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 333 });
    const { sendFullVideoToTelegram } = await import("../../src/core/telegram.js");
    const video = { id: "v1", title: "Video", duration: 120, channelName: "Channel", url: "url", filePath: "path.mp4", viewCount: 100 } as any;
    const res = await sendFullVideoToTelegram(video, mockConfig, "ytUrl");
    expect(mockSendVideo).toHaveBeenCalledTimes(1);
    expect(res).toBe(333);
  });

  it("should send full video as text if too large", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 60 * 1024 * 1024 } as any);
    mockSendMessage.mockResolvedValue({ message_id: 444 });
    const { sendFullVideoToTelegram } = await import("../../src/core/telegram.js");
    const video = { id: "v1", title: "Video", duration: 120, channelName: "Channel", url: "url", filePath: "path.mp4" } as any;
    const res = await sendFullVideoToTelegram(video, mockConfig);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(res).toBe(444);
  });

  it("should return undefined if telegram config missing for full video", async () => {
    const { sendFullVideoToTelegram } = await import("../../src/core/telegram.js");
    const res = await sendFullVideoToTelegram({} as any, { ...mockConfig, telegramBotToken: "" } as any);
    expect(res).toBeUndefined();
  });

  it("should send error alert successfully", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 555 });
    const { sendErrorAlert } = await import("../../src/core/telegram.js");
    await sendErrorAlert("Title", new Error("Some error"), mockConfig);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("should send string error alert successfully", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 555 });
    const { sendErrorAlert } = await import("../../src/core/telegram.js");
    await sendErrorAlert("Title", "Some string error", mockConfig);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("should not send error alert if missing config", async () => {
    const { sendErrorAlert } = await import("../../src/core/telegram.js");
    await sendErrorAlert("Title", new Error("err"), { ...mockConfig, telegramBotToken: "" } as any);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("should not send rate limit alert if config missing", async () => {
    const { notifyYoutubeRateLimited } = await import("../../src/core/telegram.js");
    await notifyYoutubeRateLimited({ channelName: "Chan", reason: "daily-cap" }, { ...mockConfig, telegramBotToken: "" } as any);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("should not send resumed alert if config missing", async () => {
    const { notifyYoutubeResumed } = await import("../../src/core/telegram.js");
    await notifyYoutubeResumed("Chan", { ...mockConfig, telegramBotToken: "" } as any);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("should truncate long captions", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 321 });
    const longDesc = "a".repeat(2000);
    const longShort = {
      ...mockShort,
      clip: { title: "Title", description: longDesc, hashtags: ["#tag"] } as ShortClip,
    };
    const { sendToTelegram } = await import("../../src/core/telegram.js");
    await sendToTelegram(longShort, mockConfig);
    const caption = mockSendVideo.mock.calls[0][2].caption as string;
    expect(caption.length).toBeLessThanOrEqual(1000);
  });

  it("should handle error in notifyYoutubeRateLimited gracefully", async () => {
    mockSendMessage.mockRejectedValueOnce(new Error("Net fail"));
    const { notifyYoutubeRateLimited } = await import("../../src/core/telegram.js");
    await notifyYoutubeRateLimited("Test Channel", { reason: "daily-cap", limit: 10 }, { ...mockConfig, retryBaseDelayMs: 1, retryMaxAttempts: 1, telegramBotToken: "token", telegramChatId: "chat_id" } as any);
    await notifyYoutubeRateLimited("Test Channel", { reason: "daily-cap", limit: undefined } as any, { ...mockConfig, retryBaseDelayMs: 1, retryMaxAttempts: 1, telegramBotToken: "token", telegramChatId: "chat_id" } as any);
  });

  it("should handle error in notifyYoutubeResumed gracefully", async () => {
    mockSendMessage.mockRejectedValue(new Error("Net fail"));
    const { notifyYoutubeResumed } = await import("../../src/core/telegram.js");
    await notifyYoutubeResumed("Test Channel", { ...mockConfig, retryBaseDelayMs: 1, retryMaxAttempts: 1 } as any);
  });

  it("should handle error in sendFullVideoToTelegram gracefully", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockRejectedValue(new Error("Net fail"));
    const { sendFullVideoToTelegram } = await import("../../src/core/telegram.js");
    const video = { id: "v1", title: "Video", duration: 120, channelName: "Channel", url: "url", filePath: "path.mp4" } as any;
    const res = await sendFullVideoToTelegram(video, { ...mockConfig, retryBaseDelayMs: 1, retryMaxAttempts: 1 } as any);
    expect(res).toBeUndefined();
  });

  it("should handle error in sendToTelegram gracefully", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockRejectedValue(new Error("Net fail"));
    const { sendToTelegram } = await import("../../src/core/telegram.js");
    const res = await sendToTelegram(mockShort, { ...mockConfig, retryBaseDelayMs: 1, retryMaxAttempts: 1 } as any);
    expect(res).toBeUndefined();
  });

  it("should handle error in sendErrorAlert gracefully", async () => {
    mockSendMessage.mockRejectedValue(new Error("Net fail"));
    const { sendErrorAlert } = await import("../../src/core/telegram.js");
    await sendErrorAlert("Title", "err", mockConfig);
  });

  it("should handle error in sendSummary gracefully", async () => {
    mockSendMessage.mockRejectedValue(new Error("Net fail"));
    const { sendSummary } = await import("../../src/core/telegram.js");
    await sendSummary("Title", "Channel", 2, ["err1"], mockConfig);
  });

  it("should format string error without stack", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 555 });
    const { sendErrorAlert } = await import("../../src/core/telegram.js");
    const err = new Error("msg");
    err.stack = undefined;
    await sendErrorAlert("Title", err, mockConfig);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("should send summary with many errors", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 124 });
    const { sendSummary } = await import("../../src/core/telegram.js");
    await sendSummary("Title", "Channel", 2, ["e1", "e2", "e3", "e4", "e5", "e6", "e".repeat(500)], mockConfig);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("should send notification with pending rate limit and youtube Url", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 111 });
    const { sendToTelegram } = await import("../../src/core/telegram.js");
    await sendToTelegram(mockShort, mockConfig, "yt", true);
    expect(mockSendVideo.mock.calls[0][2].caption).toContain("Pendente:");
    expect(mockSendVideo.mock.calls[0][2].caption).toContain("yt");
  });

  it("should handle error with missing message gracefully", async () => {
    mockSendMessage.mockRejectedValue("err str");
    const { sendErrorAlert } = await import("../../src/core/telegram.js");
    await sendErrorAlert("Title", { message: null }, mockConfig);
  });

  it("should handle error in notifyYoutubeRateLimited non error string gracefully", async () => {
    mockSendMessage.mockRejectedValue("err str");
    const { notifyYoutubeRateLimited } = await import("../../src/core/telegram.js");
    await notifyYoutubeRateLimited("Test Channel", { reason: "youtube-quota" }, { ...mockConfig, retryBaseDelayMs: 1, retryMaxAttempts: 1 } as any);
  });

  it("should handle error in notifyYoutubeResumed non error string gracefully", async () => {
    mockSendMessage.mockRejectedValue("err str");
    const { notifyYoutubeResumed } = await import("../../src/core/telegram.js");
    await notifyYoutubeResumed("Test Channel", { ...mockConfig, retryBaseDelayMs: 1, retryMaxAttempts: 1 } as any);
  });

  it("should handle error in notifyYoutubePublished non error string gracefully", async () => {
    mockSendMessage.mockRejectedValue("err str");
    const { notifyYoutubePublished } = await import("../../src/core/telegram.js");
    await notifyYoutubePublished({ videoId: "v", url: "u", title: "t", isShort: true }, { ...mockConfig, retryBaseDelayMs: 1, retryMaxAttempts: 1 } as any);
  });


  it("should handle notifyYoutubeRateLimited with missing limit or zero", async () => {
    mockSendMessage.mockResolvedValue({ message_id: 111 });
    const { notifyYoutubeRateLimited } = await import("../../src/core/telegram.js");
    await notifyYoutubeRateLimited({ channelName: "Test Channel", reason: "daily-cap", limit: undefined }, { ...mockConfig, telegramBotToken: "token", telegramChatId: "chat_id" } as any);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][1]).toContain("Limite diário de uploads atingido.");

    mockSendMessage.mockClear();
    await notifyYoutubeRateLimited({ channelName: "Test Channel", reason: "daily-cap", limit: 0 }, { ...mockConfig, telegramBotToken: "token", telegramChatId: "chat_id" } as any);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0][1]).toContain("Limite diário de uploads atingido (0).");
  });


});
