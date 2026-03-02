import pLimit from "p-limit";
import type {
  PipelineConfig,
  PipelineResult,
  PipelineProgress,
  VideoInfo,
  GeneratedShort,
} from "../types.js";
import {
  getChannelVideos,
  getVideoInfo,
  downloadVideo,
  cleanupVideo,
} from "./youtube.js";
import { transcribeVideo } from "./transcriber.js";
import { analyzeTranscript } from "./analyzer.js";
import { processClip } from "./video-processor.js";
import { sendToTelegram, sendSummary } from "./telegram.js";
import { logger } from "./logger.js";

export type ProgressCallback = (progress: PipelineProgress) => void;

/**
 * Run the full pipeline: fetch → download → transcribe → analyze → cut → send.
 */
export async function runPipeline(
  config: PipelineConfig,
  onProgress?: ProgressCallback,
): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  // Gather all videos to process
  const videos: VideoInfo[] = [];

  // From specific URLs
  for (const url of config.specificUrls) {
    const info = await getVideoInfo(url);
    if (info) videos.push(info);
  }

  // From channels
  for (const channel of config.channels) {
    const channelVideos = await getChannelVideos(channel, config.daysBack);
    videos.push(...channelVideos);
  }

  if (videos.length === 0) {
    logger.warn("No videos found to process");
    return results;
  }

  logger.info({ videoCount: videos.length }, "Starting pipeline");

  // Process videos sequentially (to manage resources)
  for (const video of videos) {
    const result = await processVideo(video, config, onProgress);
    results.push(result);
  }

  return results;
}

/**
 * Process a single video through the full pipeline.
 */
export async function processVideo(
  video: VideoInfo,
  config: PipelineConfig,
  onProgress?: ProgressCallback,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const shorts: GeneratedShort[] = [];

  const emitProgress = (
    stage: PipelineProgress["stage"],
    message: string,
    progress: number = 0,
    currentShort?: number,
    totalShorts?: number,
  ) => {
    onProgress?.({
      stage,
      videoId: video.id,
      videoTitle: video.title,
      currentShort,
      totalShorts,
      message,
      progress,
    });
  };

  try {
    // Step 1: Download
    emitProgress("downloading", `Baixando: ${video.title}`, 0);
    const downloaded = await downloadVideo(video, config);

    // Step 2: Transcribe
    emitProgress("transcribing", "Transcrevendo áudio com Whisper...", 20);
    const transcript = await transcribeVideo(downloaded, config);

    // Step 3: Analyze with LLM
    emitProgress("analyzing", "Analisando momentos virais com IA...", 40);
    const clips = await analyzeTranscript(
      transcript,
      video.title,
      video.channelName,
      config,
    );

    if (clips.length === 0) {
      logger.warn({ videoId: video.id }, "No suitable clips found");
      emitProgress("done", "Nenhum corte encontrado", 100);
      cleanupVideo(video.id, config);
      return {
        videoId: video.id,
        videoTitle: video.title,
        channelName: video.channelName,
        shorts: [],
        errors: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 4: Process clips (limit concurrency to preserve CPU/memory)
    const limit = pLimit(2);
    const totalClips = clips.length;

    emitProgress("cutting", `Gerando ${totalClips} shorts...`, 50, 0, totalClips);

    const clipPromises = clips.map((clip, index) =>
      limit(async () => {
        try {
          emitProgress(
            "cutting",
            `Processando corte ${index + 1}/${totalClips}`,
            50 + ((index + 1) / totalClips) * 30,
            index + 1,
            totalClips,
          );

          const short = await processClip(downloaded, clip, config);
          shorts.push(short);
          return short;
        } catch (err) {
          const msg = `Erro no corte ${clip.id}: ${err instanceof Error ? err.message : String(err)}`;
          logger.error({ clipId: clip.id, error: err }, msg);
          errors.push(msg);
          return null;
        }
      }),
    );

    await Promise.all(clipPromises);

    // Step 5: Send to Telegram
    emitProgress("uploading", "Enviando para o Telegram...", 85);

    for (const short of shorts) {
      try {
        const msgId = await sendToTelegram(short, config);
        if (msgId) short.telegramMessageId = msgId;
      } catch (err) {
        const msg = `Erro ao enviar ${short.id} para o Telegram: ${err instanceof Error ? err.message : String(err)}`;
        logger.error({ clipId: short.id, error: err }, msg);
        errors.push(msg);
      }
    }

    // Send summary
    await sendSummary(video.title, video.channelName, shorts.length, errors, config);

    // Cleanup temp files (keep output)
    cleanupVideo(video.id, config);

    emitProgress("done", `Concluído: ${shorts.length} shorts gerados`, 100);
  } catch (err) {
    const msg = `Erro fatal no vídeo ${video.id}: ${err instanceof Error ? err.message : String(err)}`;
    logger.error({ videoId: video.id, error: err }, msg);
    errors.push(msg);
    emitProgress("error", msg, 0);

    // Cleanup on error
    cleanupVideo(video.id, config);
  }

  return {
    videoId: video.id,
    videoTitle: video.title,
    channelName: video.channelName,
    shorts,
    errors,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Process a single URL (convenience function for API/frontend).
 */
export async function processUrl(
  url: string,
  config: PipelineConfig,
  onProgress?: ProgressCallback,
): Promise<PipelineResult | null> {
  const videoInfo = await getVideoInfo(url);
  if (!videoInfo) {
    logger.error({ url }, "Failed to get video info");
    return null;
  }

  return processVideo(videoInfo, config, onProgress);
}
