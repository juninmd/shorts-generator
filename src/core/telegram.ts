import { Bot, InputFile } from "grammy";
import fs from "node:fs";
import type { GeneratedShort, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

/**
 * Send a generated short to a Telegram channel.
 */
export async function sendToTelegram(
  short: GeneratedShort,
  config: PipelineConfig,
): Promise<number | undefined> {
  if (!config.telegramBotToken || !config.telegramChatId) {
    logger.warn("Telegram not configured, skipping upload");
    return undefined;
  }

  const bot = new Bot(config.telegramBotToken);

  const startMin = Math.floor(short.clip.startTime / 60);
  const startSec = Math.floor(short.clip.startTime % 60);
  const endMin = Math.floor(short.clip.endTime / 60);
  const endSec = Math.floor(short.clip.endTime % 60);

  const timeRange = `${startMin}:${startSec.toString().padStart(2, "0")} - ${endMin}:${endSec.toString().padStart(2, "0")}`;

  const caption = [
    `🎬 **${short.clip.title}**`,
    ``,
    `📺 Canal: ${short.channelName.replace(/[@_]/g, "\\$&")}`,
    `🎥 Vídeo original: ${short.originalVideoTitle}`,
    `🔗 ${short.originalVideoUrl}`,
    `⏱ Corte: ${timeRange}`,
    `⭐ Score viral: ${short.clip.viralScore}/10`,
    ``,
    `💡 ${short.clip.reason}`,
    ``,
    short.clip.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" "),
  ].join("\n");

  try {
    const fileSize = fs.statSync(short.outputPath).size;

    // Telegram limit: 50MB for bots
    if (fileSize > 50 * 1024 * 1024) {
      logger.warn(
        { clipId: short.id, sizeMB: (fileSize / 1024 / 1024).toFixed(1) },
        "Video too large for Telegram, sending link instead",
      );
      const msg = await bot.api.sendMessage(config.telegramChatId, caption, {
        parse_mode: "Markdown",
      });
      return msg.message_id;
    }

    const videoFile = new InputFile(short.outputPath);
    const msg = await bot.api.sendVideo(config.telegramChatId, videoFile, {
      caption,
      parse_mode: "Markdown",
      supports_streaming: true,
    });

    logger.info(
      { clipId: short.id, messageId: msg.message_id },
      "Sent to Telegram",
    );

    return msg.message_id;
  } catch (error) {
    logger.error({ error, clipId: short.id }, "Failed to send to Telegram");
    return undefined;
  }
}

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
    `📊 **Resumo do processamento**`,
    ``,
    `${status}`,
    `📺 Canal: ${channelName.replace(/[@_]/g, "\\$&")}`,
    `🎥 Vídeo: ${videoTitle}`,
    `✂️ Shorts gerados: ${shortsCount}`,
    errors.length > 0 ? `❌ Erros: ${errors.length}` : "",
    errors.length > 0 ? `\n${errors.map((e) => `• ${e}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await bot.api.sendMessage(config.telegramChatId, message, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    logger.error({ error }, "Failed to send summary to Telegram");
  }
}
