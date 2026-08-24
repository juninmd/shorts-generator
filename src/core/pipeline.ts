
import type { PipelineConfig, PipelineResult, VideoInfo } from "../types.js";
import { getChannelVideos, getTopChannelVideos, getVideoInfo, downloadAudioOnly, downloadVideoSection, cleanupVideo } from "./youtube.js";
import { getPostedTopVideosAsync, markVideoAsPostedAsync } from "./state.js";
import { sendFullVideoToTelegram, sendErrorAlert } from "./telegram.js";
import { uploadFullVideoToYouTube } from "./youtube.service.js";
import { logger } from "./logger.js";
import { isMusicVideoByTitle, isVideoWithinLimits, selectValidVideos, matchesVideoQuery } from "./pipeline-filters.js";
import { processVideo } from "./pipeline-video-processor.js";
import { buildFullVideoDescription, buildFullVideoTags } from "./full-video-metadata.js";

export type { ProgressCallback } from "./pipeline-video-processor.js";
export { processVideo };

export async function runTopVideoPipeline(
  config: PipelineConfig,
  onProgress?: (progress: import("../types.js").PipelineProgress) => void,
): Promise<PipelineResult[]> {
  if (config.channels.length === 0) {
    logger.warn("No channels configured for top video pipeline");
    return [];
  }

  const randomChannel = config.channels[Math.floor(Math.random() * config.channels.length)]!;
  logger.info({ channel: randomChannel }, "Selected random channel for top video pipeline");

  const topVideos = await getTopChannelVideos(randomChannel, 20, config.maxVideoDurationSec);
  const channelId = config.managedRun?.channelId || randomChannel;
  const postedVideos = new Set(await getPostedTopVideosAsync(channelId));

  let targetVideo: VideoInfo | null = null;
  for (const video of topVideos) {
    if (!postedVideos.has(video.id)) {
      if (await isVideoWithinLimits(video, config)) {
        if (await isMusicVideoByTitle(video.title, randomChannel, config)) continue;
        const fullInfo = await getVideoInfo(video.url);
        if (fullInfo) { targetVideo = fullInfo; break; }
      }
    }
  }

  if (!targetVideo) {
    logger.warn("No valid unposted top video found for this channel.");
    return [];
  }

  onProgress?.({ stage: "downloading", videoId: targetVideo.id, videoTitle: targetVideo.title, message: `Baixando áudio: ${targetVideo.title}`, progress: 10 });

  const startTime = Date.now();
  try {
    const downloaded = await downloadAudioOnly(targetVideo, config);
    onProgress?.({ stage: "uploading", videoId: targetVideo.id, videoTitle: targetVideo.title, message: "Enviando para o YouTube e Telegram...", progress: 60 });

    const fullVideoPath = await downloadVideoSection(targetVideo, 0, targetVideo.duration, config);
    const downloadedFull = { ...downloaded, filePath: fullVideoPath };
    const ytDescription = buildFullVideoDescription(targetVideo);
    const ytTags = buildFullVideoTags(targetVideo, config);
    const youtubeUrl = await uploadFullVideoToYouTube(downloadedFull.filePath, targetVideo.title, ytDescription, config, ytTags);

    await sendFullVideoToTelegram(downloadedFull, config, youtubeUrl);
    if (!config.keepTempFiles) cleanupVideo(targetVideo.id, config);
    await markVideoAsPostedAsync(targetVideo.id, channelId);

    onProgress?.({ stage: "done", videoId: targetVideo.id, videoTitle: targetVideo.title, message: "Vídeo completo publicado no Telegram com sucesso", progress: 100 });
    return [{ videoId: targetVideo.id, videoTitle: targetVideo.title, channelName: targetVideo.channelName, shorts: [], errors: [], processingTimeMs: Date.now() - startTime }];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error, videoId: targetVideo.id }, "Failed to process full top video");
    if (!config.keepTempFiles) cleanupVideo(targetVideo.id, config);
    await sendErrorAlert(`Vídeo completo: ${targetVideo.title}`, error, config);
    return [{ videoId: targetVideo.id, videoTitle: targetVideo.title, channelName: targetVideo.channelName, shorts: [], errors: [msg], processingTimeMs: Date.now() - startTime }];
  }
}

export async function runPipeline(
  config: PipelineConfig,
  onProgress?: (progress: import("../types.js").PipelineProgress) => void,
): Promise<PipelineResult[]> {
  logger.info({ runId: config.managedRun?.runId, channelId: config.managedRun?.channelId, channels: config.channels, urls: config.specificUrls, videoQuery: config.videoQuery || "none" }, "Pipeline starting");

  const videos: VideoInfo[] = [];

  for (const url of config.specificUrls) {
    const info = await getVideoInfo(url);
    if (info && matchesVideoQuery(info, config) && (await isVideoWithinLimits(info, config))) {
      videos.push(info);
    }
  }

  for (const channel of config.channels) {
    const channelVideos = config.sortByViews
      ? await getTopChannelVideos(channel, config.videoLimit, config.maxVideoDurationSec)
      : await getChannelVideos(channel, config.videoLimit, config.maxVideoDurationSec);
    const selected = await selectValidVideos(channelVideos, config);
    if (selected.length > 0) videos.push(...selected);
  }

  if (videos.length === 0) {
    logger.warn("No videos found to process");
    return [];
  }

  logger.info({ videoCount: videos.length }, "Starting pipeline");

  const results: PipelineResult[] = [];
  let totalShorts = 0;

  for (const video of videos) {
    if (config.targetShorts && totalShorts >= config.targetShorts) break;
    const remainingShorts = config.targetShorts ? Math.max(config.targetShorts - totalShorts, 0) : undefined;
    const videoResult = await processVideo(video, config, onProgress, remainingShorts || undefined);
    totalShorts += videoResult.shorts.length;
    results.push(videoResult);
    if (config.targetShorts && totalShorts >= config.targetShorts) {
      logger.info({ targetShorts: config.targetShorts }, "Target de shorts alcançado; finalizando pipeline");
      break;
    }
  }

  logger.info({ runId: config.managedRun?.runId, channelId: config.managedRun?.channelId, shortsCount: results.reduce((sum, r) => sum + r.shorts.length, 0) }, "Pipeline completed");
  return results;
}

export async function processUrl(
  url: string,
  config: PipelineConfig,
  onProgress?: (progress: import("../types.js").PipelineProgress) => void,
): Promise<PipelineResult | null> {
  const videoInfo = await getVideoInfo(url);
  return videoInfo ? processVideo(videoInfo, config, onProgress) : null;
}
