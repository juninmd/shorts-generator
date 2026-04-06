/* v8 ignore start */
import {
  getChannelVideos,
  getTopChannelVideos,
  getVideoInfo,
  verifyYoutubeAccess,
  searchYoutubeVideos,
  runCatholicRadar,
} from "./youtube.js";
import { logger } from "./logger.js";
import type {
  PipelineConfig,
  PipelineResult,
  VideoInfo,
} from "../types.js";
import { isVideoWithinLimits, selectValidVideos } from "./pipeline-utils.js";
import { processVideo } from "./pipeline-processor.js";

export { runTopVideoPipeline } from "./pipeline-top.js";
export { processVideo } from "./pipeline-processor.js";
export { isVideoWithinLimits, selectValidVideos } from "./pipeline-utils.ts";

/**
 * Run the full pipeline.
 */
export async function runPipeline(
  config: PipelineConfig,
  onProgress?: (progress: import("../types.js").PipelineProgress) => void,
): Promise<PipelineResult[]> {
  try {
    await verifyYoutubeAccess(config);
  } catch (error: any) {
    logger.fatal({ error: error.message }, "Pipeline aborted");
    throw error;
  }

  const videos: VideoInfo[] = [];

  // 1. Process specific URLs
  for (const url of config.specificUrls) {
    const info = await getVideoInfo(url);
    if (info && (await isVideoWithinLimits(info, config))) videos.push(info);
  }

  // 2. Process specific Channels
  for (const channel of config.channels) {
    const channelVideos = config.sortByViews
      ? await getTopChannelVideos(channel, config.videoLimit, config.maxVideoDurationSec)
      : await getChannelVideos(channel, config.videoLimit, config.maxVideoDurationSec);
    const selected = await selectValidVideos(channelVideos, config);
    videos.push(...selected);
  }

  // 3. Process Search Queries
  if (config.searchQueries?.length) {
    for (const query of config.searchQueries) {
      const results = await searchYoutubeVideos(query, config.videoLimit);
      const selected = await selectValidVideos(results, config);
      videos.push(...selected);
    }
  }

  // 4. Run Catholic Radar
  if (config.catholicRadar) {
    const radarResults = await runCatholicRadar(undefined, 2); // Default guests
    const selected = await selectValidVideos(radarResults, config);
    videos.push(...selected);
  }

  // Deduplicate videos by ID before processing
  const uniqueVideos = Array.from(new Map(videos.map(v => [v.id, v])).values());

  if (uniqueVideos.length === 0) return [];

  logger.info({ videoCount: uniqueVideos.length }, "Starting pipeline");

  const results: PipelineResult[] = [];
  let totalShorts = 0;

  for (const video of uniqueVideos) {
    if (config.targetShorts && totalShorts >= config.targetShorts) break;

    const remaining = config.targetShorts ? Math.max(config.targetShorts - totalShorts, 0) : undefined;
    const videoResult = await processVideo(video, config, onProgress, remaining);

    totalShorts += videoResult.shorts.length;
    results.push(videoResult);

    if (config.targetShorts && totalShorts >= config.targetShorts) break;
  }

  return results;
}

/**
 * Process a single URL.
 */
export async function processUrl(
  url: string,
  config: PipelineConfig,
  onProgress?: (progress: any) => void,
): Promise<PipelineResult | null> {
  const videoInfo = await getVideoInfo(url);
  return videoInfo ? processVideo(videoInfo, config, onProgress) : null;
}
