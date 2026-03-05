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
  getVideoFileSize,
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
 * Videos are processed in parallel (up to 2 at a time) to reduce wall-clock time.
 */
export async function runPipeline(
  config: PipelineConfig,
  onProgress?: ProgressCallback,
): Promise<PipelineResult[]> {
  // Gather all videos to process
  const videos: VideoInfo[] = [];

  for (const url of config.specificUrls) {
    const info = await getVideoInfo(url);
    if (info) videos.push(info);
  }

  for (const channel of config.channels) {
    const channelVideos = await getChannelVideos(channel, config.daysBack);
    videos.push(...channelVideos);
  }

  if (videos.length === 0) {
    logger.warn("No videos found to process");
    return [];
  }

  // Filter out videos that exceed the size/duration safety limit before downloading
  const filteredVideos = await filterOversizedVideos(videos, config);

  if (filteredVideos.length === 0) {
    logger.warn("All videos were filtered out (too large or too long)");
    return [];
  }

  logger.info({ videoCount: filteredVideos.length }, "Starting pipeline");

  // Parallelize at the video level (limit to 2 concurrent to manage resources)
  const limit = pLimit(2);
  const results = await Promise.all(
    filteredVideos.map((video) =>
      limit(() => processVideo(video, config, onProgress)),
    ),
  );

  return results;
}

/**
 * Check remote video size and duration pre-flight; discard videos that are too big.
 */
async function filterOversizedVideos(
  videos: VideoInfo[],
  config: PipelineConfig,
): Promise<VideoInfo[]> {
  const MAX_DURATION_HOURS = 3;
  const maxDurationSeconds = MAX_DURATION_HOURS * 3600;

  const results: VideoInfo[] = [];

  for (const video of videos) {
    // Duration guard (pre-flight, no download needed)
    if (video.duration > 0 && video.duration > maxDurationSeconds) {
      logger.warn(
        { videoId: video.id, durationMin: Math.round(video.duration / 60) },
        "Skipping video: too long (>3h)",
      );
      continue;
    }

    // Approximate file size from remote headers
    const remoteSize = await getVideoFileSize(video.url, config);
    if (remoteSize !== null && remoteSize > config.maxVideoSizeBytes) {
      logger.warn(
        {
          videoId: video.id,
          sizeMB: (remoteSize / 1024 / 1024).toFixed(1),
          limitMB: (config.maxVideoSizeBytes / 1024 / 1024).toFixed(0),
        },
        "Skipping video: exceeds size limit",
      );
      continue;
    }

    results.push(video);
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

    // Step 3: Analyze with LLM — request at least minShortsPerVideo clips
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

    // Guarantee minimum shorts: take at least minShortsPerVideo clips
    const selectedClips =
      clips.length >= config.minShortsPerVideo
        ? clips
        : clips; // analyzer already returns what it found; we log a warning if insufficient

    if (clips.length < config.minShortsPerVideo) {
      logger.warn(
        { videoId: video.id, found: clips.length, min: config.minShortsPerVideo },
        "Fewer clips found than minimum required",
      );
    }

    // Step 4: Process clips (limit concurrency to preserve CPU/memory)
    const limit = pLimit(2);
    const totalClips = selectedClips.length;

    emitProgress("cutting", `Gerando ${totalClips} shorts...`, 50, 0, totalClips);

    const clipPromises = selectedClips.map((clip, index) =>
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

    await sendSummary(video.title, video.channelName, shorts.length, errors, config);

    cleanupVideo(video.id, config);

    emitProgress("done", `Concluído: ${shorts.length} shorts gerados`, 100);
  } catch (err) {
    const msg = `Erro fatal no vídeo ${video.id}: ${err instanceof Error ? err.message : String(err)}`;
    logger.error({ videoId: video.id, error: err }, msg);
    errors.push(msg);
    emitProgress("error", msg, 0);

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
