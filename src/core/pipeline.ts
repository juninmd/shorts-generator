import type {
  PipelineConfig,
  PipelineResult,
  PipelineProgress,
  VideoInfo,
  GeneratedShort,
} from "../types.js";
import {
  getChannelVideos,
  getTopChannelVideos,
  getVideoInfo,
  getVideoFileSize,
  downloadVideo,
  cleanupVideo,
  verifyYoutubeAccess,
} from "./youtube.js";
import { getPostedTopVideos, markVideoAsPosted } from "./state.js";
import { transcribeVideo } from "./transcriber.js";
import { analyzeTranscript } from "./analyzer.js";
import { processClip } from "./video-processor.js";
import { sendToTelegram, sendSummary, sendFullVideoToTelegram } from "./telegram.js";
import { generateYoutubeMetadata, uploadToYouTube, uploadFullVideoToYouTube } from "./youtube.service.js";
import { Ollama } from "ollama";
import { logger } from "./logger.js";

export type ProgressCallback = (progress: PipelineProgress) => void;

/**
 * Use the LLM to determine if a video title/channel suggests a music video.
 * Returns true if the LLM thinks it's a music/song clip, false otherwise.
 * Fails open (returns false) so legitimate videos are never accidentally skipped.
 */
async function isMusicVideoByTitle(
  title: string,
  channelName: string,
  config: PipelineConfig,
): Promise<boolean> {
  const ollama = new Ollama({ host: config.ollamaBaseUrl || "http://localhost:11434" });

  const prompt = `Analise o título e canal do vídeo abaixo e responda APENAS com "sim" ou "não":
Este vídeo é uma música, clipe musical ou canção (não uma palestra, sermão, homilia, meditação ou pregação)?

Título: ${title}
Canal: ${channelName}

Responda APENAS "sim" se for música/clipe musical, ou "não" se for conteúdo falado (palestra, pregação, homilia, etc.).`;

  try {
    const response = await ollama.chat({
      model: config.ollamaModel || "gemma3:1b",
      messages: [{ role: "user", content: prompt }],
    });
    const answer = response.message.content.trim().toLowerCase();
    const isMusic = answer.includes("sim");
    if (isMusic) {
      logger.info({ title, channelName }, "LLM identified video as music — skipping");
    }
    return isMusic;
  } catch (error) {
    logger.warn({ error, title }, "LLM music check failed — assuming not music");
    return false;
  }
}

/**
 * Special pipeline: fetch the top non-music videos from a random channel,
 * pick one that hasn't been posted yet, and process it.
 */
export async function runTopVideoPipeline(
  config: PipelineConfig,
  onProgress?: ProgressCallback,
): Promise<PipelineResult[]> {
  try {
    await verifyYoutubeAccess(config);
  } catch (error: any) {
    logger.fatal({ error: error.message }, "Top Pipeline aborted: YouTube access check failed");
    throw error;
  }

  if (config.channels.length === 0) {
    logger.warn("No channels configured for top video pipeline");
    return [];
  }

  // Pick a random channel
  const randomChannel = config.channels[Math.floor(Math.random() * config.channels.length)]!;
  logger.info({ channel: randomChannel }, "Selected random channel for top video pipeline");

  const topVideos = await getTopChannelVideos(randomChannel, 20);
  const postedVideos = new Set(getPostedTopVideos());
  
  let targetVideo: VideoInfo | null = null;

  for (const video of topVideos) {
    if (!postedVideos.has(video.id)) {
      if (await isVideoWithinLimits(video, config)) {
        // Use LLM to check title — YouTube categories are unreliable for religious content
        if (await isMusicVideoByTitle(video.title, randomChannel, config)) continue;
        const fullInfo = await getVideoInfo(video.url);
        if (fullInfo) {
          targetVideo = fullInfo;
          break;
        }
      }
    }
  }

  if (!targetVideo) {
    logger.warn("No valid unposted top video found for this channel.");
    return [];
  }

  logger.info({ videoId: targetVideo.id, title: targetVideo.title }, "Found unposted top video to process");

  // Bypass short generation, just download and send full video to Telegram
  onProgress?.({
    stage: "downloading",
    videoId: targetVideo.id,
    videoTitle: targetVideo.title,
    message: `Baixando vídeo completo: ${targetVideo.title}`,
    progress: 10,
  });

  const startTime = Date.now();

  try {
    const downloaded = await downloadVideo(targetVideo, config);

    onProgress?.({
      stage: "uploading",
      videoId: targetVideo.id,
      videoTitle: targetVideo.title,
      message: "Enviando vídeo completo para o YouTube e Telegram...",
      progress: 60,
    });

    const ytDescription = `Este é um repost do canal: ${targetVideo.channelName}\n\nAssista ao original aqui: ${targetVideo.url}`;
    const youtubeUrl = await uploadFullVideoToYouTube(
      downloaded.filePath,
      targetVideo.title,
      ytDescription,
      config
    );

    await sendFullVideoToTelegram(downloaded, config, youtubeUrl);

    cleanupVideo(targetVideo.id, config);
    markVideoAsPosted(targetVideo.id);

    onProgress?.({
      stage: "done",
      videoId: targetVideo.id,
      videoTitle: targetVideo.title,
      message: "Vídeo completo publicado no Telegram com sucesso",
      progress: 100,
    });

    return [{
      videoId: targetVideo.id,
      videoTitle: targetVideo.title,
      channelName: targetVideo.channelName,
      shorts: [],
      errors: [],
      processingTimeMs: Date.now() - startTime,
    }];
  } catch (error: any) {
    logger.error({ error, videoId: targetVideo.id }, "Failed to process full top video");
    cleanupVideo(targetVideo.id, config);
    return [{
      videoId: targetVideo.id,
      videoTitle: targetVideo.title,
      channelName: targetVideo.channelName,
      shorts: [],
      errors: [error.message],
      processingTimeMs: Date.now() - startTime,
    }];
  }
}

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
  // 0. Sanity check: is YouTube blocking us?
  try {
    await verifyYoutubeAccess(config);
  } catch (error: any) {
    logger.fatal({ error: error.message }, "Pipeline aborted: YouTube access check failed");
    // We throw here because this is a non-recoverable environment issue
    throw error;
  }

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
    const channelVideos = await getChannelVideos(channel, config.videoLimit);
    const selected = await selectValidVideos(channelVideos, config);
    if (selected.length > 0) {
      videos.push(...selected);
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
  if (video.liveStatus === "is_upcoming") {
    logger.warn(
      { videoId: video.id, title: video.title },
      "Skipping video: it hasn't premiered yet (is_upcoming)",
    );
    return false;
  }

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
 * Iterate through a channel's video list and return the first X videos that
 * pass size and duration limits.
 *
 * Note: music category filtering is intentionally NOT applied here — YouTube
 * frequently miscategorizes religious/meditation content as "Music". The user
 * configures channels explicitly, so we trust their intent.
 */
async function selectValidVideos(
  videos: VideoInfo[],
  config: PipelineConfig,
): Promise<VideoInfo[]> {
  const selected: VideoInfo[] = [];
  for (const video of videos) {
    if (!(await isVideoWithinLimits(video, config))) continue;
    logger.info({ videoId: video.id, title: video.title }, "Selected valid video for channel");
    selected.push(video);
    if (selected.length >= config.videoLimit) break;
  }
  return selected;
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

    const youtubeEnabled = process.env.ENABLE_YOUTUBE === "true";

    for (const short of shorts) {
      try {
        // 1. Post to YouTube (if enabled) — do this first to get the URL
        const youtubeMeta = await generateYoutubeMetadata(short, config);
        const youtubeUrl = await uploadToYouTube(
          short.outputPath,
          youtubeMeta.title,
          youtubeMeta.description,
          config,
        );

        if (youtubeEnabled && !youtubeUrl) {
          const msg = `YouTube upload falhou para o short "${short.clip.title}"`;
          logger.error({ clipId: short.id }, msg);
          errors.push(msg);
        }

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
