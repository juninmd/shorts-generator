import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOAuthCallbackUrl, generateReauthUrl, sendReauthAlert } from "../../src/core/youtube-reauth.js";
import { logger } from "../../src/core/logger.js";

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

vi.mock("../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  }
}));

describe("youtube-reauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTelegramMessage.mockReset();
  });

  describe("getOAuthCallbackUrl", () => {
    it("returns correct URL", () => {
      expect(getOAuthCallbackUrl("http://localhost:3000")).toBe("http://localhost:3000/api/youtube/callback");
    });
  });

  describe("generateReauthUrl", () => {
    it("generates correctly", () => {
      const url = generateReauthUrl("clientId", "clientSecret", "http://localhost:3000", "channelId");
      expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url).toContain("client_id=clientId");
      expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fyoutube%2Fcallback");
      expect(url).toContain("state=channelId");
    });
  });

  describe("sendReauthAlert", () => {
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
      expect(logger.info).toHaveBeenCalledWith({ channelId: "ch1" }, "Reauth alert sent to Telegram");
    });

    it("should fallback to channelId if channelName is missing", async () => {
      const config = {
        telegramBotToken: "token",
        telegramChatId: "chat",
      } as any;

      await sendReauthAlert("ch1", "", "http://auth", config);
      expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1);
      const [, text] = mockSendTelegramMessage.mock.calls[0];
      expect(text).toContain("Canal:</b> ch1");
    });

    it("should log error when sendMessage fails", async () => {
      const config = {
        telegramBotToken: "token",
        telegramChatId: "chat",
      } as any;
      const error = new Error("Failed");

      mockSendTelegramMessage.mockRejectedValueOnce(error);

      await sendReauthAlert("ch1", "Channel 1", "http://auth", config);
      expect(logger.error).toHaveBeenCalledWith({ e: error }, "Failed to send reauth alert to Telegram");
    });
  });
});
