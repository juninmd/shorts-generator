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
    telegramBotToken: "dummy_bot_val",
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

  it("should handle error in sendToTelegram gracefully", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockRejectedValue(new Error("Network Error"));
    const result = await sendToTelegram(mockShort, mockConfig);
    expect(result).toBeUndefined();
  });

  it("should handle error in sendSummary gracefully", async () => {
    mockSendMessage.mockRejectedValue(new Error("Network Error"));
    await sendSummary("Title", "Channel", 2, ["Error 1"], mockConfig);
    // Just ensuring it doesn't throw
  });

  it("should include youtube url when provided", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 123 });
    const result = await sendToTelegram(mockShort, mockConfig, "https://youtube.com/shorts/123");
    expect(mockSendVideo).toHaveBeenCalledTimes(1);
    expect(mockSendVideo.mock.calls[0][2].caption).toContain("https://youtube.com/shorts/123");
  });

  it("should escape html entities properly", async () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 10 * 1024 * 1024 } as any);
    mockSendVideo.mockResolvedValue({ message_id: 123 });
    const localShort = {
      ...mockShort,
      clip: { ...mockShort.clip, title: "<Fake&Name>" }
    };
    await sendToTelegram(localShort as any, mockConfig);
    expect(mockSendVideo.mock.calls[0][2].caption).toContain("&lt;Fake&amp;Name&gt;");
  });
});
