/* v8 ignore start */
import type { PipelineConfig, PipelineProgress, PipelineResult, VideoInfo, GeneratedShort } from "../types.js";
import { downloadAudioOnly, downloadVideoSection, cleanupVideo } from "./youtube.js";
import { transcribeVideo } from "./transcriber.js";
import { analyzeTranscript } from "./analyzer.js";
import { processClip, getFileStartTime } from "./video-processor.js";
import { sendToTelegram, sendSummary } from "./telegram.js";
import { generateYoutubeMetadata, uploadToYouTube, addCommentToVideo } from "./youtube.service.js";
import { isDailyLimitReachedAsync, incrementDailyUploadCountAsync } from "./state.js";
import { logger } from "./logger.js";
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
      if (!config.keepTempFiles) cleanupVideo(video.id, config);
      return { videoId: video.id, videoTitle: video.title, channelName: video.channelName, shorts: [], errors: [], processingTimeMs: Date.now() - startTime };
    }

    const totalClips = clips.length;
    emitProgress("cutting", `Gerando ${totalClips} shorts...`, 50, 0, totalClips);

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

    emitProgress("uploading", "Enviando resultados...", 85);
    const youtubeEnabled = process.env.ENABLE_YOUTUBE === "true";

    for (const short of shorts) {
      try {
        const youtubeMeta = await generateYoutubeMetadata(short, config);
        let youtubeUrl: string | undefined;
        if (youtubeEnabled) {
          if (await isDailyLimitReachedAsync(config.dailyUploadLimit)) {
            logger.warn({ limit: config.dailyUploadLimit }, "⚠️ Limite diário de uploads do YouTube atingido — enviando apenas ao Telegram");
          } else {
            youtubeUrl = await uploadToYouTube(short.outputPath, youtubeMeta.title, youtubeMeta.description, config, youtubeMeta.tags) ?? undefined;
            if (!youtubeUrl) {
              logger.warn({ clipId: short.id }, "YouTube upload failed, skipping URL but continuing to Telegram");
            } else {
              await incrementDailyUploadCountAsync();
              
              // Post original video link in comments
              const videoId = youtubeUrl.split("/").pop();
              if (videoId) {
                const commentText = `Vídeo original: ${video.url}`;
                await addCommentToVideo(videoId, commentText, config);
              }
            }
          }
        }
        const msgId = await sendToTelegram(short, config, youtubeUrl);
        if (msgId) short.telegramMessageId = msgId;
      } catch (err) {
        errors.push(`Erro no envio de ${short.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

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
}
/* v8 ignore stop */
