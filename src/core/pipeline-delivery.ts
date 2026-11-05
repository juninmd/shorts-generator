import type { GeneratedShort, PipelineConfig, VideoInfo } from "../types.js";
import { sendToTelegram } from "./telegram.js";
import { generateYoutubeMetadata, uploadToYouTube, addCommentToVideo, buildEngagementComment } from "./youtube.service.js";
import { isDailyLimitReachedAsync, incrementDailyUploadCountAsync } from "./state.js";
import { logger } from "./logger.js";
import { enqueueYoutubeUpload } from "./queue.js";
import { deliverWithPublication, publicationStore } from "./publication/clip-publication-flow.js";

/** Legacy delivery (no control-plane DB): direct upload or env-config upload queue. */
async function deliverLegacy(short: GeneratedShort, video: VideoInfo, config: PipelineConfig, meta: Awaited<ReturnType<typeof generateYoutubeMetadata>>): Promise<string | undefined> {
  const channelId = config.managedRun?.channelId || "global";
  if (meta.held) {
    logger.warn({ clipId: short.id, reasons: meta.heldReasons }, "Metadados inválidos: corte retido, sem upload automático");
    return undefined;
  }
  let youtubeUrl: string | undefined;
  if (process.env.DEFER_UPLOADS === "true") {
    logger.info({ clipId: short.id, channelId }, "🌙 DEFER_UPLOADS ativo — enfileirando no PVC para publicação diurna em vez de subir agora");
  } else if (await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
    logger.warn({ limit: config.dailyUploadLimit, channelId }, "⚠️ Limite diário de uploads do YouTube atingido — enviando para a fila");
  } else {
    youtubeUrl = await uploadToYouTube(short.outputPath, meta.title, meta.description, config, meta.tags) ?? undefined;
    if (!youtubeUrl) {
      logger.warn({ clipId: short.id }, "YouTube upload failed, queueing for retry");
    } else {
      await incrementDailyUploadCountAsync(channelId);
      const videoId = youtubeUrl.split("/").pop();
      if (videoId) await addCommentToVideo(videoId, buildEngagementComment(video.url, config.managedRun?.focusLabels), config);
      return youtubeUrl;
    }
  }
  await enqueueYoutubeUpload(short, meta.title, meta.description, config, meta.tags);
  return undefined;
}

/** Metadata -> publication state (or legacy upload) -> Telegram. Throws with the failing stage in the message. */
export async function deliverShort(short: GeneratedShort, video: VideoInfo, config: PipelineConfig): Promise<void> {
  let stage = "metadata";
  try {
    const meta = await generateYoutubeMetadata(short, config);
    const youtubeEnabled = process.env.ENABLE_YOUTUBE === "true";
    const db = publicationStore();
    let youtubeUrl: string | undefined;
    if (db && short.publicationId) {
      stage = "publication";
      const outcome = await deliverWithPublication(db, short, meta, config);
      short.publicationStatus = outcome.status;
      youtubeUrl = outcome.youtubeUrl;
    } else if (youtubeEnabled) {
      stage = "youtube_upload_or_queue";
      youtubeUrl = await deliverLegacy(short, video, config, meta);
      short.publicationStatus = youtubeUrl ? "published" : meta.held ? "pending_review" : "publish_pending";
    }
    stage = "telegram";
    const msgId = await sendToTelegram(short, config, youtubeUrl, youtubeEnabled && !youtubeUrl);
    if (msgId) short.telegramMessageId = msgId;
  } catch (err) {
    logger.error({ error: err, clipId: short.id, stage, runId: config.managedRun?.runId, channelId: config.managedRun?.channelId }, "Failed to send generated short");
    throw err;
  }
}
