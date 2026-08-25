
import type { PipelineConfig, PipelineProgress, PipelineResult, VideoInfo, GeneratedShort } from "../types.js";
import { downloadAudioOnly, downloadVideoSection, cleanupVideo } from "./youtube.js";
import { transcribeVideo } from "./transcriber.js";
import { analyzeTranscript } from "./analyzer.js";
import { processClip, getFileStartTime } from "./video-processor.js";
import { sendToTelegram, sendSummary } from "./telegram.js";
import { generateYoutubeMetadata, uploadToYouTube, addCommentToVideo, buildEngagementComment } from "./youtube.service.js";
import { isDailyLimitReachedAsync, incrementDailyUploadCountAsync } from "./state.js";
import { logger } from "./logger.js";
import { enqueueYoutubeUpload } from "./queue.js";
import pLimit from "p-limit";

export type ProgressCallback = (progress: PipelineProgress) => void;

export async function processVideo(
  video: VideoInfo,
  config: PipelineConfig,
  onProgress?: ProgressCallback,
  maxShorts?: number,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const shorts: GeneratedShort[] = [];

  const emitProgress = (stage: PipelineProgress["stage"], message: string, progress = 0, currentShort?: number, totalShorts?: number) => {
    onProgress?.({ stage, videoId: video.id, videoTitle: video.title, currentShort, totalShorts, message, progress });
  };

  try {
    emitProgress("downloading", `Baixando áudio: ${video.title}`, 0);
    const downloadedAudio = await downloadAudioOnly(video, config);

    let lastProgress = 20;
    emitProgress("transcribing", "Transcrevendo com Whisper...", lastProgress);
    const transcript = await transcribeVideo(downloadedAudio, {
      ...config,
      onProgress: (percent: number) => {
        const mapped = 20 + (percent / 100) * 20;
        if (mapped - lastProgress >= 1 || percent === 100) {
          lastProgress = mapped;
          emitProgress("transcribing", `Transcrevendo com Whisper... (${percent.toFixed(1)}%)`, mapped);
        }
      },
    });

    emitProgress("analyzing", "Analisando momentos virais...", 40);
    let clips = await analyzeTranscript(transcript, video.title, video.channelName, config);

    if (maxShorts !== undefined && maxShorts > 0 && clips.length > maxShorts) {
      clips = clips.slice(0, maxShorts);
    }

    if (clips.length === 0) {
      logger.warn({ videoId: video.id, videoTitle: video.title }, "Transcrição analisada, mas a IA considerou que não há trechos interessantes ou relevantes. Pulando vídeo.");
      /* v8 ignore start */
      if (!config.keepTempFiles) cleanupVideo(video.id, config);
      return { videoId: video.id, videoTitle: video.title, channelName: video.channelName, shorts: [], errors: [], processingTimeMs: Date.now() - startTime };
      /* v8 ignore stop */
    }

    const totalClips = clips.length;
    emitProgress("cutting", `Gerando ${totalClips} shorts...`, 50, 0, totalClips);

    /* v8 ignore start */
    const limit = pLimit(2);
    await Promise.all(
      clips.map((clip, index) =>
        limit(async () => {
          try {
            emitProgress("cutting", `Baixando trecho ${index + 1}/${totalClips}`, 50 + ((index + 1) / totalClips) * 15, index + 1, totalClips);

            const sectionPath = await downloadVideoSection(video, clip.startTime, clip.endTime, config);
            const downloadedSection = { ...downloadedAudio, filePath: sectionPath };

            // yt-dlp with DASH streams resets timestamps to 0; detect and compute correct seek offset
            const sectionStartTime = await getFileStartTime(sectionPath);
            const expectedSectionStart = Math.max(0, clip.startTime - 2);
            const timestampsPreserved = Math.abs(sectionStartTime - expectedSectionStart) <= 10;
            const seekOffset = timestampsPreserved
              ? clip.startTime
              : Math.max(0, clip.startTime - expectedSectionStart);
            const sectionClip = { ...clip, startTime: seekOffset, endTime: seekOffset + clip.duration };

            logger.debug({ clipId: clip.id, sectionStartTime, expectedSectionStart, timestampsPreserved, seekOffset }, "Section seek offset");

            emitProgress("cutting", `Processando corte ${index + 1}/${totalClips}`, 65 + ((index + 1) / totalClips) * 15, index + 1, totalClips);
            const short = await processClip(downloadedSection, sectionClip, config);
            shorts.push(short);
          } catch (err) {
            errors.push(`Erro no corte ${clip.id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }),
      ),
    );

    /* v8 ignore stop */
    emitProgress("uploading", "Enviando resultados...", 85);
    const youtubeEnabled = process.env.ENABLE_YOUTUBE === "true";
    // Night-generation mode: skip the immediate upload (don't burn the daily
    // quota at 3am) and always enqueue, so queue-process drips them out during
    // the day per the YouTube rate limit.
    const deferUploads = process.env.DEFER_UPLOADS === "true";

    for (const short of shorts) {
      let sendStage = "metadata";
      try {
        sendStage = "metadata";
        const youtubeMeta = await generateYoutubeMetadata(short, config);
        let youtubeUrl: string | undefined;
        if (youtubeEnabled) {
          sendStage = "youtube_upload_or_queue";
          const channelId = config.managedRun?.channelId || "global";
          let uploaded = false;
          if (deferUploads) {
            logger.info({ clipId: short.id, channelId }, "🌙 DEFER_UPLOADS ativo — enfileirando no PVC para publicação diurna em vez de subir agora");
          } else if (await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
            logger.warn({ limit: config.dailyUploadLimit, channelId }, "⚠️ Limite diário de uploads do YouTube atingido — enviando para a fila");
          } else {
            youtubeUrl = await uploadToYouTube(short.outputPath, youtubeMeta.title, youtubeMeta.description, config, youtubeMeta.tags) ?? undefined;
            if (!youtubeUrl) {
              logger.warn({ clipId: short.id }, "YouTube upload failed, queueing for retry");
            } else {
              uploaded = true;
              await incrementDailyUploadCountAsync(channelId);
              
              // Engagement question + original link as the channel's comment
              /* v8 ignore start */
              const videoId = youtubeUrl.split("/").pop();
              if (videoId) {
                const commentText = buildEngagementComment(video.url, config.managedRun?.focusLabels);
                await addCommentToVideo(videoId, commentText, config);
              }
              /* v8 ignore stop */
            }
          }
          if (!uploaded) {
            await enqueueYoutubeUpload(short, youtubeMeta.title, youtubeMeta.description, config, youtubeMeta.tags);
          }
        }
        sendStage = "telegram";
        const pendingRateLimit = youtubeEnabled && !youtubeUrl;
        const msgId = await sendToTelegram(short, config, youtubeUrl, pendingRateLimit);
        /* v8 ignore start */
        if (msgId) short.telegramMessageId = msgId;
      } catch (err) {
        logger.error(
          {
            error: err,
            clipId: short.id,
            stage: sendStage,
            runId: config.managedRun?.runId,
            channelId: config.managedRun?.channelId,
          },
          "Failed to send generated short",
        );
        errors.push(`Erro no envio de ${short.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    /* v8 ignore start */
    await sendSummary(video.title, video.channelName, shorts.length, errors, config);
    if (!config.keepTempFiles) cleanupVideo(video.id, config);
    emitProgress("done", "Concluído", 100);
  } catch (err) {
    logger.error({ videoId: video.id, error: err }, "Fatal video error");
    errors.push(String(err));
    if (!config.keepTempFiles) cleanupVideo(video.id, config);
    await sendSummary(video.title, video.channelName, shorts.length, errors, config);
  }

  return { videoId: video.id, videoTitle: video.title, channelName: video.channelName, shorts, errors, processingTimeMs: Date.now() - startTime };
/* v8 ignore stop */
}
