
import { Bot } from "grammy";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { withRetry } from "./retry-backoff.js";

export function getBot(config: PipelineConfig): Bot | null {
  if (!config.telegramBotToken || !config.telegramChatId) return null;
  return new Bot(config.telegramBotToken);
}

export async function sendTelegramMessage(
  config: PipelineConfig,
  text: string,
  options?: any
) {
  const bot = getBot(config);
  if (!bot) return null;

  return withRetry(
    () => bot.api.sendMessage(config.telegramChatId!, text, { parse_mode: "HTML", ...options }),
    { maxAttempts: 3, baseDelayMs: 2000, logMessage: "Telegram message sending failed, retrying..." }
  );
}
