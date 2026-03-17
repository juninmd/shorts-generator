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
import { generateYoutubeMetadata, uploadToYouTube } from "./youtube.service.js";
import { logger } from "./logger.js";

export type ProgressCallback = (progress: PipelineProgress) => void;

/**
 * Run the full pipeline: fetch → download → transcribe → analyze → cut → send.
 *
 * Business rule:
 *   - For each channel: select the FIRST video that is under the size limit
 *     (default 500 MB) and generate at least 1 clip from it.
 *   - Specific URLs: apply the same size/duration pre-flight check before processing.
 */
export async function runPipeline(
  config: PipelineConfig,
  onProgress?: ProgressCallback,
): Promise<PipelineResult[]> {
  const videos: VideoInfo[] = [];

  // Specific URLs: fetch info then apply size/duration pre-flight check
  for (const url of config.specificUrls) {
    const info = await getVideoInfo(url);
    if (info && (await isVideoWithinLimits(info, config))) {
      videos.push(info);
    }
  }

  // Channels: pick exactly the first video per channel that fits within the size limit
  for (const channel of config.channels) {
    const channelVideos = await getChannelVideos(channel, config.daysBack);
    const selected = await selectFirstValidVideo(channelVideos, config);
    if (selected) {
      videos.push(selected);
    } else {
      logger.warn(
        { channel },
        "No suitable video found for channel (all exceed size/duration limit)",
      );
    }
  }

  if (videos.length === 0) {
    logger.warn("No videos found to process");
    return [];
  }

  logger.info({ videoCount: videos.length }, "Starting pipeline");

  // Process videos one at a time to avoid resource conflicts
  const results: PipelineResult[] = [];
  for (const video of videos) {
    results.push(await processVideo(video, config, onProgress));
  }

  return results;
}

/**
 * Check whether a single video passes duration and size limits.
 */
async function isVideoWithinLimits(
  video: VideoInfo,
  config: PipelineConfig,
): Promise<boolean> {
  const MAX_DURATION_SECONDS = 3 * 3600;

  if (video.duration > 0 && video.duration > MAX_DURATION_SECONDS) {
    logger.warn(
      { videoId: video.id, durationMin: Math.round(video.duration / 60) },
      "Skipping video: too long (>3h)",
    );
    return false;
  }

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
    return false;
  }

  return true;
}

/**
 * Iterate through a channel's video list and return the first video that
 * passes size and duration limits.  Checks lazily — stops at the first match.
 */
async function selectFirstValidVideo(
  videos: VideoInfo[],
  config: PipelineConfig,
): Promise<VideoInfo | null> {
  for (const video of videos) {
    if (await isVideoWithinLimits(video, config)) {
      logger.info(
        { videoId: video.id, title: video.title },
        "Selected first valid video for channel",
      );
      return video;
    }
  }
  return null;
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

    // Step 4: Process clips sequentially to avoid resource conflicts
    const totalClips = selectedClips.length;

    emitProgress("cutting", `Gerando ${totalClips} shorts...`, 50, 0, totalClips);

    for (let index = 0; index < selectedClips.length; index++) {
      const clip = selectedClips[index]!;
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
      } catch (err) {
        const msg = `Erro no corte ${clip.id}: ${err instanceof Error ? err.message : String(err)}`;
        logger.error({ clipId: clip.id, error: err }, msg);
        errors.push(msg);
      }
    }

    // Step 5: Send to Telegram & YouTube
    emitProgress("uploading", "Enviando para o Telegram e YouTube...", 85);

    for (const short of shorts) {
      try {
        // 1. Post to YouTube (if enabled) - Do this first to get the URL
        const youtubeMeta = await generateYoutubeMetadata(short, config);
        const youtubeUrl = await uploadToYouTube(
          short.outputPath,
          youtubeMeta.title,
          youtubeMeta.description,
          config
        );

        // 2. Post to Telegram with the YouTube link
        const msgId = await sendToTelegram(short, config, youtubeUrl);
        if (msgId) short.telegramMessageId = msgId;
      } catch (err) {
        const msg = `Erro no envio de ${short.id}: ${err instanceof Error ? err.message : String(err)}`;
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
