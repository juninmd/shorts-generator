import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendReauthAlert } from "../../src/core/youtube-reauth.js";

const mockSendTelegramMessage = vi.fn();

vi.mock("grammy", () => {
  return {
    Bot: vi.fn().mockImplementation(function () {
      return {
        api: {
          sendMessage: mockSendTelegramMessage,
        },
      };
    }),
    InlineKeyboard: class {
      url = vi.fn().mockReturnThis();
    },
  };
});

describe("youtube-reauth", () => {
  beforeEach(() => {
    mockSendTelegramMessage.mockReset();
  });

  it("should do nothing if bot token or chat ID is missing", async () => {
    await sendReauthAlert("ch1", "Channel 1", "http://auth", {} as any);
    expect(mockSendTelegramMessage).not.toHaveBeenCalled();
  });

  it("should send reauth alert with inline keyboard", async () => {
    const config = {
      telegramBotToken: "token",
      telegramChatId: "chat",
    } as any;

    await sendReauthAlert("ch1", "Channel 1", "http://auth", config);
    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);

    const [chatId, text, options] = mockSendTelegramMessage.mock.calls[0];
    expect(chatId).toBe("chat");
    expect(text).toContain("🔑 <b>TOKEN YOUTUBE EXPIRADO</b>");
    expect(text).toContain("Channel 1");
    expect(options.reply_markup).toBeDefined();
    expect(options.link_preview_options).toEqual({ is_disabled: true });
  });
});
