import { Bot, InputFile } from "grammy";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";
import { enqueueYoutubeUpload } from "../queue.js";
import { incrementDailyUploadCountAsync, isDailyLimitReachedAsync } from "../state.js";
import { uploadToYouTube } from "../youtube.service.js";
import type { Quiz } from "./quiz.domain.js";
import { buildTelegramCaption, buildYoutubeMetadata, buildYoutubeRelayCaption } from "./quiz-copy.js";

export async function sendQuizToTelegram(quiz: Quiz, outputPath: string, config: PipelineConfig, watermarkText: string): Promise<boolean> {
  if (!config.telegramBotToken || !config.telegramChatId) return false;
  try {
    const bot = new Bot(config.telegramBotToken);
    await bot.api.sendVideo(config.telegramChatId, new InputFile(outputPath), {
      caption: `🎬 <b>NOVO QUIZ GERADO</b>\n──────────────────────\n${buildTelegramCaption(quiz, watermarkText)}\n\n──────────────────────\n<i>Quiz Shorts Generator AI</i>`,
      supports_streaming: true,
      parse_mode: "HTML",
    });
    logger.info("✅ Vídeo enviado ao Telegram com sucesso");
    return true;
  } catch (err: any) {
    logger.error({ error: err.message }, "❌ Erro ao enviar vídeo para o Telegram");
    return false;
  }
}

/** Uploads now or enqueues (reference-only config) when the daily cap is reached or upload fails. */
export async function publishQuizToYoutube(
  quiz: Quiz, outputPath: string, jobId: string, config: PipelineConfig, watermarkText: string, provenance: readonly string[],
): Promise<string | null> {
  const meta = buildYoutubeMetadata(quiz, watermarkText, provenance);
  const channelId = config.managedRun?.channelId || "global";
  let youtubeUrl: string | null = null;
  if (await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
    logger.warn({ channelId }, "⚠️ Limite diário atingido — enfileirando quiz para o PVC");
    await enqueueYoutubeUpload({ id: jobId, outputPath }, meta.title, meta.description, config, meta.tags);
    return null;
  }
  youtubeUrl = await uploadToYouTube(outputPath, meta.title, meta.description, config, meta.tags);
  if (!youtubeUrl) {
    logger.warn({ jobId }, "Upload do quiz falhou — enfileirando para retry (acumulado no PVC)");
    await enqueueYoutubeUpload({ id: jobId, outputPath }, meta.title, meta.description, config, meta.tags);
    return null;
  }
  await incrementDailyUploadCountAsync(channelId);
  if (config.telegramBotToken && config.telegramChatId) {
    try {
      await new Bot(config.telegramBotToken).api.sendMessage(config.telegramChatId, buildYoutubeRelayCaption(quiz, youtubeUrl), { parse_mode: "HTML" });
    } catch (err: any) {
      logger.error({ error: err.message }, "❌ Erro ao enviar link do YouTube para o Telegram");
    }
  }
  return youtubeUrl;
}
