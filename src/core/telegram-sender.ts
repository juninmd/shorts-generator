import { Bot, InputFile } from "grammy";
import fs from "node:fs";
import type { GeneratedShort, PipelineConfig, DownloadedVideo } from "../types.js";
import { logger } from "./logger.js";

export function escapeHtml(text: string): string {
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
  video: DownloadedVideo,
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
    `🎬 <b>${escapeHtml(video.title)}</b>`,
    ``,
    `📺 Canal: ${escapeHtml(video.channelName)}`,
    `⏱ Duração: ${durationStr}`,
    `👁 Visualizações: ${video.viewCount ? video.viewCount.toLocaleString("pt-BR") : "N/A"}`,
    youtubeOutputUrl ? `🔴 Seu Repost no YouTube: <a href="${youtubeOutputUrl}">${youtubeOutputUrl}</a>` : "",
    `🔗 Link original: <a href="${video.url}">${escapeHtml(video.url)}</a>`,
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
    `🎬 <b>${escapeHtml(short.clip.title)}</b>`,
    ``,
    `📺 Canal: ${escapeHtml(short.channelName)}`,
    `🎥 Vídeo original: ${escapeHtml(short.originalVideoTitle)}`,
    youtubeUrl ? `🔴 Assistir no YouTube: <a href="${youtubeUrl}">${youtubeUrl}</a>` : "",
    `🔗 Link original: <a href="${short.originalVideoUrl}">${escapeHtml(short.originalVideoUrl)}</a>`,
    `⏱ Corte: ${timeRange}`,
    `⭐ Score viral: ${short.clip.viralScore}/10`,
    ``,
    `💡 ${escapeHtml(short.clip.reason)}`,
    ``,
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
