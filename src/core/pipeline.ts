
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
  downloadAudioOnly,
  downloadVideoSection,
  cleanupVideo,
  verifyYoutubeAccess,
} from "./youtube.js";
import { getPostedTopVideos, markVideoAsPosted, isDailyLimitReached, incrementDailyUploadCount } from "./state.js";
import { transcribeVideo } from "./transcriber.js";
import { analyzeTranscript } from "./analyzer.js";
import { processClip, getFileStartTime } from "./video-processor.js";
import { sendToTelegram, sendSummary, sendFullVideoToTelegram } from "./telegram.js";
import { generateYoutubeMetadata, uploadToYouTube, uploadFullVideoToYouTube } from "./youtube.service.js";
import { generateText } from "ai";
import { logger } from "./logger.js";
import { createModel } from "./ai-provider.js";
import pLimit from "p-limit";

export type ProgressCallback = (progress: PipelineProgress) => void;

/**
 * Use the LLM to determine if a video title/channel suggests a music video.
 */
async function isMusicVideoByTitle(
  title: string,
  channelName: string,
  config: PipelineConfig,
): Promise<boolean> {
  const prompt = `Analise o título e canal do vídeo abaixo e responda APENAS com "sim" ou "não":
Este vídeo é uma música, clipe musical ou canção (não uma palestra, sermão, homilia, meditação ou pregação)?

Título: ${title}
Canal: ${channelName}

Responda APENAS "sim" se for música/clipe musical, ou "não" se for conteúdo falado (palestra, pregação, homilia, etc.).`;

  try {
    const { text } = await generateText({
      model: createModel(config),
      prompt,
      temperature: 0.1,
      maxOutputTokens: 10,
    });
    const answer = text.trim().toLowerCase();
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

  const randomChannel = config.channels[Math.floor(Math.random() * config.channels.length)]!;
  logger.info({ channel: randomChannel }, "Selected random channel for top video pipeline");

  const topVideos = await getTopChannelVideos(randomChannel, 20, config.maxVideoDurationSec);
  const postedVideos = new Set(getPostedTopVideos());

  let targetVideo: VideoInfo | null = null;

  for (const video of topVideos) {
    if (!postedVideos.has(video.id)) {
      if (await isVideoWithinLimits(video, config)) {
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

  onProgress?.({
    stage: "downloading",
    videoId: targetVideo.id,
    videoTitle: targetVideo.title,
    message: `Baixando áudio: ${targetVideo.title}`,
    progress: 10,
  });

  const startTime = Date.now();

  try {
    const downloaded = await downloadAudioOnly(targetVideo, config);

    onProgress?.({
      stage: "uploading",
      videoId: targetVideo.id,
      videoTitle: targetVideo.title,
      message: "Enviando para o YouTube e Telegram...",
      progress: 60,
    });

    // For top videos we download the full section now
    const fullVideoPath = await downloadVideoSection(targetVideo, 0, targetVideo.duration, config);
    const downloadedFull = { ...downloaded, filePath: fullVideoPath };

    const ytDescription = `Este é um repost do canal: ${targetVideo.channelName}\n\nAssista ao original aqui: ${targetVideo.url}`;
    const youtubeUrl = await uploadFullVideoToYouTube(
      downloadedFull.filePath,
      targetVideo.title,
      ytDescription,
      config
    );

    await sendFullVideoToTelegram(downloadedFull, config, youtubeUrl);

    if (!config.keepTempFiles) cleanupVideo(targetVideo.id, config);
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
    if (!config.keepTempFiles) cleanupVideo(targetVideo.id, config);
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
 */
export async function runPipeline(
  config: PipelineConfig,
  onProgress?: ProgressCallback,
): Promise<PipelineResult[]> {
  try {
    await verifyYoutubeAccess(config);
  } catch (error: any) {
    logger.fatal({ error: error.message }, "Pipeline aborted: YouTube access check failed");
    throw error;
  }

  const videos: VideoInfo[] = [];

  for (const url of config.specificUrls) {
    const info = await getVideoInfo(url);
    if (info && (await isVideoWithinLimits(info, config))) {
      videos.push(info);
    }
  }

  for (const channel of config.channels) {
    const channelVideos = config.sortByViews
      ? await getTopChannelVideos(channel, config.videoLimit, config.maxVideoDurationSec)
      : await getChannelVideos(channel, config.videoLimit, config.maxVideoDurationSec);
    const selected = await selectValidVideos(channelVideos, config);
    if (selected.length > 0) {
      videos.push(...selected);
    }
  }

  if (videos.length === 0) {
    logger.warn("No videos found to process");
    return [];
  }

  logger.info({ videoCount: videos.length }, "Starting pipeline");

  const results: PipelineResult[] = [];
  let totalShorts = 0;

  for (const video of videos) {
    /* v8 ignore start */
    if (config.targetShorts && totalShorts >= config.targetShorts) {
      break;
    }
    /* v8 ignore stop */

    const remainingShorts = config.targetShorts ? Math.max(config.targetShorts - totalShorts, 0) : undefined;
    const videoResult = await processVideo(video, config, onProgress, remainingShorts || undefined);

    totalShorts += videoResult.shorts.length;
    results.push(videoResult);

    /* v8 ignore start */
    if (config.targetShorts && totalShorts >= config.targetShorts) {
      logger.info({ targetShorts: config.targetShorts }, "Target de shorts alcançado; finalizando pipeline");
      break;
    }
    /* v8 ignore stop */
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
  /* v8 ignore start */
  if (video.liveStatus === "is_upcoming") {
    logger.warn({ videoId: video.id, title: video.title }, "Skipping upcoming video");
    return false;
  }
  /* v8 ignore stop */

  const MAX_DURATION_SECONDS = 3 * 3600;
  if (video.duration > 0 && video.duration > MAX_DURATION_SECONDS) {
    logger.warn({ videoId: video.id }, "Skipping video: too long (>3h)");
    return false;
  }

  if (!config.skipVideoSizeCheck) {
    const remoteSize = await getVideoFileSize(video.url, config);
    if (remoteSize !== null && remoteSize > config.maxVideoSizeBytes) {
      logger.warn({ videoId: video.id }, "Skipping video: exceeds size limit");
      return false;
    }
  }

  return true;
}

/**
 * Iterate through a channel's video list and return the first X valid videos.
 */
async function selectValidVideos(
  videos: VideoInfo[],
  config: PipelineConfig,
): Promise<VideoInfo[]> {
  const selected: VideoInfo[] = [];
  for (const video of videos) {
    if (!(await isVideoWithinLimits(video, config))) continue;
    logger.info({ videoId: video.id, title: video.title }, "Selected valid video");
    selected.push(video);
    if (selected.length >= config.videoLimit) break;
  }
  return selected;
}

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
      /* v8 ignore start */
      onProgress: (percent: number) => {
        // Map progress from 20 to 40
        const mapped = 20 + (percent / 100) * 20;
        if (mapped - lastProgress >= 1 || percent === 100) {
          lastProgress = mapped;
          emitProgress("transcribing", `Transcrevendo com Whisper... (${percent.toFixed(1)}%)`, mapped);
        }
      },
      /* v8 ignore stop */
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
              /* v8 ignore next */
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

/**
 * Process a single URL.
 */
export async function processUrl(
  url: string,
  config: PipelineConfig,
  onProgress?: ProgressCallback,
): Promise<PipelineResult | null> {
  const videoInfo = await getVideoInfo(url);
  return videoInfo ? processVideo(videoInfo, config, onProgress) : null;
}
