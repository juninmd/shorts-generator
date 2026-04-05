import type { PipelineConfig, PipelineResult, VideoInfo } from "../types.js";
import {
  getTopChannelVideos,
  getVideoInfo,
  downloadAudioOnly,
  downloadVideoSection,
  cleanupVideo,
  verifyYoutubeAccess,
} from "./youtube.js";
import { getPostedTopVideos, markVideoAsPosted } from "./state.js";
import { sendFullVideoToTelegram } from "./telegram.js";
import { uploadFullVideoToYouTube } from "./youtube.service.js";
import { generateText } from "ai";
import { logger } from "./logger.js";
import { createModel } from "./ai-provider.js";
import { isVideoWithinLimits, type ProgressCallback } from "./pipeline-utils.js";

/**
 * Use the LLM to determine if a video title/channel suggests a music video.
 */
export async function isMusicVideoByTitle(
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
