/* v8 ignore start */
import type {
  PipelineConfig,
  PipelineResult,
  VideoInfo,
} from "../types.js";
import {
  getChannelVideos,
  getTopChannelVideos,
  getVideoInfo,
  verifyYoutubeAccess,
} from "./youtube.js";
import { logger } from "./logger.js";
import { isVideoWithinLimits, selectValidVideos, type ProgressCallback } from "./pipeline-utils.js";
import { processVideo } from "./pipeline-processor.js";

export { runTopVideoPipeline, isMusicVideoByTitle } from "./pipeline-top.js";
export { processVideo } from "./pipeline-processor.js";
export { isVideoWithinLimits, selectValidVideos, type ProgressCallback } from "./pipeline-utils.js";

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
    if (config.targetShorts && totalShorts >= config.targetShorts) {
      break;
    }

    const remainingShorts = config.targetShorts ? Math.max(config.targetShorts - totalShorts, 0) : undefined;
    const videoResult = await processVideo(video, config, onProgress, remainingShorts || undefined);

    totalShorts += videoResult.shorts.length;
    results.push(videoResult);

    if (config.targetShorts && totalShorts >= config.targetShorts) {
      logger.info({ targetShorts: config.targetShorts }, "Target de shorts alcançado; finalizando pipeline");
      break;
    }
  }

  return results;
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
/* v8 ignore stop */
