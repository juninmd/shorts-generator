/* v8 ignore start */
import { Bot, InputFile } from "grammy";
import type { GeneratedShort, PipelineConfig, DownloadedVideo } from "../types.js";
import { logger } from "./logger.js";
import fs from "node:fs";

/**
 * Send a generated short video to Telegram.
 */
export async function sendToTelegram(
  short: GeneratedShort,
  config: PipelineConfig,
  youtubeUrl?: string,
): Promise<number | undefined> {
  if (!config.telegramBotToken || !config.telegramChatId) return undefined;

  const bot = new Bot(config.telegramBotToken);
  const caption = `🎬 *${short.clip.title}*\n\n${short.clip.description}\n\n📍 Canal: ${short.channelName}\n🔗 Origem: [YouTube](${short.originalVideoUrl})${youtubeUrl ? `\n📺 Shorts: [YouTube Shorts](${youtubeUrl})` : ""}\n\n${short.clip.hashtags.join(" ")}`;

  logger.info({ clipId: short.id }, "Sending to Telegram");

  try {
    const stats = fs.statSync(short.outputPath);
    const sizeMb = stats.size / (1024 * 1024);

    if (sizeMb > 49) {
      const res = await bot.api.sendMessage(config.telegramChatId, `⚠️ *Vídeo muito grande (${sizeMb.toFixed(1)}MB)*\n\n${caption}`, { parse_mode: "Markdown" });
      return res.message_id;
    }

    const res = await bot.api.sendVideo(config.telegramChatId, new InputFile(short.outputPath), {
      caption,
      parse_mode: "Markdown",
    });
    return res.message_id;
  } catch (error) {
    logger.error({ error }, "Telegram send failed");
    return undefined;
  }
}

/**
 * Send full video repost to Telegram.
 */
export async function sendFullVideoToTelegram(
  video: DownloadedVideo,
  config: PipelineConfig,
  youtubeUrl?: string,
): Promise<number | undefined> {
  if (!config.telegramBotToken || !config.telegramChatId) return undefined;

  const bot = new Bot(config.telegramBotToken);
  const caption = `📺 *REPOST COMPLETO*\n🎬 *${video.title}*\n\n📍 Canal: ${video.channelName}\n🔗 Origem: [YouTube](${video.url})${youtubeUrl ? `\n📺 Assista aqui: [YouTube Repost](${youtubeUrl})` : ""}`;

  try {
    return (await bot.api.sendVideo(config.telegramChatId, new InputFile(video.filePath), {
      caption,
      parse_mode: "Markdown",
    })).message_id;
  } catch (error) {
    logger.error({ error }, "Telegram full video failed");
    return undefined;
  }
}
