/* v8 ignore start */
import { Bot, InputFile } from "grammy";
import fs from "node:fs";
import type { GeneratedShort, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Send a full video to a Telegram channel (used by generate:top).
 */
export async function sendFullVideoToTelegram(
  video: import("../types.js").DownloadedVideo,
  config: PipelineConfig,
  youtubeOutputUrl?: string | null,
): Promise<number | undefined> {
  if (!config.telegramBotToken || !config.telegramChatId) {
    logger.warn("Telegram not configured, skipping upload");
    return undefined;
  }

  const bot = new Bot(config.telegramBotToken);

  const durationMin = Math.floor(video.duration / 60);
  const durationSec = Math.floor(video.duration % 60);
  const durationStr = `${durationMin}:${durationSec.toString().padStart(2, "0")}`;

  const caption = [
    `🎬 <b>VÍDEO COMPLETO</b>`,
    `──────────────────────`,
    `📌 <b>${escapeHtml(video.title)}</b>`,
    ``,
    `📺 <b>Canal:</b> ${escapeHtml(video.channelName)}`,
    `⏱ <b>Duração:</b> ${durationStr}`,
    `👁 <b>Visualizações:</b> ${video.viewCount ? video.viewCount.toLocaleString("pt-BR") : "N/A"}`,
    ``,
    youtubeOutputUrl ? `🔴 <b>Repost no YouTube:</b> <a href="${youtubeOutputUrl}">Assistir agora</a>` : "",
    `🔗 <b>Link Original:</b> <a href="${video.url}">Ver no YouTube</a>`,
    `──────────────────────`,
    `<i>Processado via Shorts Generator AI</i>`
  ].filter(line => line !== "").join("\n");

  try {
    const fileSize = fs.statSync(video.filePath).size;
    
    // Telegram limit: 50MB for bots
    if (fileSize > 50 * 1024 * 1024) {
      logger.warn(
        { videoId: video.id, sizeMB: (fileSize / 1024 / 1024).toFixed(1) },
        "Full video too large for Telegram, sending link instead",
      );
      const msg = await bot.api.sendMessage(config.telegramChatId, caption, {
        parse_mode: "HTML",
      });
      return msg.message_id;
    }

    const videoFile = new InputFile(video.filePath);
    const msg = await bot.api.sendVideo(config.telegramChatId, videoFile, {
      caption,
      parse_mode: "HTML",
      supports_streaming: true,
    });

    logger.info(
      { videoId: video.id, messageId: msg.message_id },
      "Sent full video to Telegram",
    );

    return msg.message_id;
  } catch (error) {
    logger.error({ error, videoId: video.id }, "Failed to send full video to Telegram");
    return undefined;
  }
}

/**
 * Send a generated short to a Telegram channel.
 */
export async function sendToTelegram(
  short: GeneratedShort,
  config: PipelineConfig,
  youtubeUrl?: string | null,
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
    `✂️ <b>NOVO SHORT GERADO</b>`,
    `──────────────────────`,
    `🎬 <b>${escapeHtml(short.clip.title)}</b>`,
    ``,
    `📺 <b>Canal:</b> ${escapeHtml(short.channelName)}`,
    `🎥 <b>Original:</b> ${escapeHtml(short.originalVideoTitle)}`,
    `⏱ <b>Corte:</b> <code>${timeRange}</code>`,
    `⭐ <b>Score Viral:</b> ${short.clip.viralScore}/10`,
    ``,
    `💡 <b>Insight:</b> <i>${escapeHtml(short.clip.reason)}</i>`,
    ``,
    youtubeUrl ? `🔴 <b>YouTube:</b> <a href="${youtubeUrl}">Assistir Short</a>` : "",
    `🔗 <b>Original:</b> <a href="${short.originalVideoUrl}">Link</a>`,
    ``,
    `──────────────────────`,
    short.clip.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).map(escapeHtml).join(" "),
  ].filter(line => line !== "").join("\n");

  // Truncate caption if it exceeds Telegram's 1024 character limit for media
  const finalCaption = caption.length > 1000 ? caption.substring(0, 997) + "..." : caption;

  try {
    const fileSize = fs.statSync(short.outputPath).size;

    // Telegram limit: 50MB for bots
    if (fileSize > 50 * 1024 * 1024) {
      logger.warn(
        { clipId: short.id, sizeMB: (fileSize / 1024 / 1024).toFixed(1) },
        "Video too large for Telegram, sending link instead",
      );
      const msg = await bot.api.sendMessage(config.telegramChatId, finalCaption, {
        parse_mode: "HTML",
      });
      return msg.message_id;
    }

    const videoFile = new InputFile(short.outputPath);
    const msg = await bot.api.sendVideo(config.telegramChatId, videoFile, {
      caption: finalCaption,
      parse_mode: "HTML",
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
    `📊 <b>RESUMO DO PROCESSAMENTO</b>`,
    `──────────────────────`,
    `Estado: ${status}`,
    `📺 <b>Canal:</b> ${escapeHtml(channelName)}`,
    `🎥 <b>Vídeo:</b> ${escapeHtml(videoTitle)}`,
    `✂️ <b>Shorts Gerados:</b> ${shortsCount}`,
    errors.length > 0 ? `❌ <b>Erros:</b> ${errors.length}` : "",
    errors.length > 0 ? "\n" + errors.slice(0, 5).map((e) => {
      const eStr = String(e);
      const truncated = eStr.length > 300 ? eStr.substring(0, 300) + "..." : eStr;
      return `• ${escapeHtml(truncated)}`;
    }).join("\n") + (errors.length > 5 ? `\n• ...e mais ${errors.length - 5} erros` : "") : "",
    `──────────────────────`,
    `<i>Pipeline concluído em ${new Date().toLocaleDateString('pt-BR')}</i>`
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
/* v8 ignore stop */
