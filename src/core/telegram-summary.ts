/* v8 ignore start */
import { Bot } from "grammy";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

/**
 * Send a processing summary to Telegram.
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
  const status = errors.length === 0 ? "✅ Sucesso" : shortsCount > 0 ? "⚠️ Parcial" : "❌ Falha";
  
  const message = `📊 *Resumo de Processamento*\n\n` +
                `🎥 Vídeo: ${videoTitle}\n` +
                `📍 Canal: ${channelName}\n` +
                `🎬 Shorts: ${shortsCount}\n` +
                `🚦 Status: ${status}` +
                (errors.length > 0 ? `\n\n❌ *Erros:*\n${errors.map(e => `- ${e}`).join("\n").slice(0, 500)}` : "");

  try {
    await bot.api.sendMessage(config.telegramChatId, message, { parse_mode: "Markdown" });
  } catch (error) {
    logger.error({ error }, "Failed to send summary");
  }
}
