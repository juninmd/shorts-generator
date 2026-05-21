/* v8 ignore start */
import type { PipelineConfig, VideoInfo } from "../types.js";
import { getVideoFileSize } from "./youtube.js";
import { generateText } from "ai";
import { logger } from "./logger.js";
import { createModel } from "./ai-provider.js";

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
    const isMusic = text.trim().toLowerCase().includes("sim");
    if (isMusic) {
      logger.info({ title, channelName }, "LLM identified video as music — skipping");
    }
    return isMusic;
  } catch (error) {
    logger.warn({ error, title }, "LLM music check failed — assuming not music");
    /* v8 ignore next 2 */
    return false;
  }
}

export async function isVideoWithinLimits(
  video: VideoInfo,
  config: PipelineConfig,
): Promise<boolean> {
  if (video.liveStatus === "is_upcoming") {
    logger.warn({ videoId: video.id, title: video.title }, "Skipping upcoming video");
    return false;
  }

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

export async function selectValidVideos(
  videos: VideoInfo[],
  config: PipelineConfig,
): Promise<VideoInfo[]> {
  const selected: VideoInfo[] = [];
  for (const video of videos) {
    if (!matchesVideoQuery(video, config)) continue;
    if (!(await isVideoWithinLimits(video, config))) continue;
    logger.info({ videoId: video.id, title: video.title }, "Selected valid video");
    selected.push(video);
    if (selected.length >= config.videoLimit) break;
  }
  return selected;
}

export function matchesVideoQuery(video: VideoInfo, config: PipelineConfig): boolean {
  if (!config.videoQuery) return true;
  const match = video.title.toLowerCase().includes(config.videoQuery.toLowerCase());
  if (!match) {
    logger.debug({ videoId: video.id, title: video.title, query: config.videoQuery }, "Video filtered out by query");
  }
  return match;
}
/* v8 ignore stop */
