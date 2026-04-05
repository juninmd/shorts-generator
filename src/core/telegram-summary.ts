import { Bot } from "grammy";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { escapeHtml } from "./telegram-sender.js";

/**
 * Send a summary message to Telegram after processing.
 */
export async function sendSummary(
  videoTitle: string,
  channelName: string,
  shortsCount: number,
  errors: string[],
  config: PipelineConfig,
): Promise<void> {
  if (!config.telegramBotToken || !config.telegramChatId) return;

  const bot = new Bot(config.telegramBotToken);

  const status = errors.length === 0 ? "✅ Sucesso" : "⚠️ Com erros";

  const message = [
    `📊 <b>Resumo do processamento</b>`,
    ``,
    `${status}`,
    `📺 Canal: ${escapeHtml(channelName)}`,
    `🎥 Vídeo: ${escapeHtml(videoTitle)}`,
    `✂️ Shorts gerados: ${shortsCount}`,
    errors.length > 0 ? `❌ Erros: ${errors.length}` : "",
    errors.length > 0 ? "\n" + errors.slice(0, 5).map((e) => {
      const eStr = String(e);
      const truncated = eStr.length > 300 ? eStr.substring(0, 300) + "..." : eStr;
      return `• ${escapeHtml(truncated)}`;
    }).join("\n") + (errors.length > 5 ? `\n• ...e mais ${errors.length - 5} erros` : "") : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await bot.api.sendMessage(config.telegramChatId, message, {
      parse_mode: "HTML",
    });
  } catch (error) {
    logger.error({ error }, "Failed to send summary to Telegram");
  }
}
