import type { VideoInfo, PipelineConfig, PipelineResult, GeneratedShort, PipelineProgress } from "../types.js";
import { downloadAudioOnly, downloadVideoSection, cleanupVideo } from "./youtube.js";
import { transcribeVideo } from "./transcriber.js";
import { analyzeTranscript } from "./analyzer.js";
import { processClip, getFileStartTime } from "./video-processor.js";
import { sendToTelegram, sendSummary } from "./telegram.js";
import { generateYoutubeMetadata, uploadToYouTube } from "./youtube.service.js";
import { isDailyLimitReached, incrementDailyUploadCount } from "./state.js";
import { logger } from "./logger.js";
import pLimit from "p-limit";
import type { ProgressCallback } from "./pipeline-utils.js";

/**
 * Process a single video through the full pipeline using two-stage download.
 */
export async function processVideo(
  video: VideoInfo,
  config: PipelineConfig,
  onProgress?: ProgressCallback,
  maxShorts?: number,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const shorts: GeneratedShort[] = [];

  const emitProgress = (stage: PipelineProgress["stage"], message: string, progress: number = 0, currentShort?: number, totalShorts?: number) => {
    onProgress?.({ stage, videoId: video.id, videoTitle: video.title, currentShort, totalShorts, message, progress });
  };

  try {
    // Stage 1: Audio Only
    emitProgress("downloading", `Baixando áudio: ${video.title}`, 0);
    const downloadedAudio = await downloadAudioOnly(video, config);

    // Stage 2: Transcription
    let lastProgress = 20;
    emitProgress("transcribing", "Transcrevendo com Whisper...", lastProgress);
    const transcript = await transcribeVideo(downloadedAudio, {
      ...config,
      onProgress: (percent: number) => {
        // Map progress from 20 to 40
        const mapped = 20 + (percent / 100) * 20;
        if (mapped - lastProgress >= 1 || percent === 100) {
          lastProgress = mapped;
          emitProgress("transcribing", `Transcrevendo com Whisper... (${percent.toFixed(1)}%)`, mapped);
        }
      },
    });

    // Stage 3: LLM Analysis
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

    // Stage 4: Partial Downloads & Cutting
    const limit = pLimit(2);
    await Promise.all(
      clips.map((clip, index) =>
        limit(async () => {
          try {
            emitProgress("cutting", `Baixando trecho ${index + 1}/${totalClips}`, 50 + ((index + 1) / totalClips) * 15, index + 1, totalClips);

            const sectionPath = await downloadVideoSection(video, clip.startTime, clip.endTime, config);
            const downloadedSection = { ...downloadedAudio, filePath: sectionPath };

            // yt-dlp with DASH streams (video+audio merged) resets timestamps to 0 in the output
            // file, while single-stream downloads preserve original timestamps. Detect which case
            // we're in and compute the correct seek offset within the section file.
            const sectionStartTime = await getFileStartTime(sectionPath);
            const expectedSectionStart = Math.max(0, clip.startTime - 2);
            const timestampsPreserved = Math.abs(sectionStartTime - expectedSectionStart) <= 10;
            const seekOffset = timestampsPreserved
              ? clip.startTime                                       // absolute seek (original ts)
              : Math.max(0, clip.startTime - expectedSectionStart); // relative seek (ts reset to 0)
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

    // Stage 5: Uploads
    emitProgress("uploading", "Enviando resultados...", 85);
    const youtubeEnabled = process.env.ENABLE_YOUTUBE === "true";

    for (const short of shorts) {
      try {
        const youtubeMeta = await generateYoutubeMetadata(short, config);
        let youtubeUrl: string | undefined;
        if (youtubeEnabled) {
          if (isDailyLimitReached(config.dailyUploadLimit)) {
            logger.warn({ limit: config.dailyUploadLimit }, "⚠️ Limite diário de uploads do YouTube atingido — enviando apenas ao Telegram");
          } else {
            youtubeUrl = await uploadToYouTube(short.outputPath, youtubeMeta.title, youtubeMeta.description, config) ?? undefined;
            incrementDailyUploadCount();
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
  }

  return { videoId: video.id, videoTitle: video.title, channelName: video.channelName, shorts, errors, processingTimeMs: Date.now() - startTime };
}
