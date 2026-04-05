import type { PipelineProgress, VideoInfo, PipelineConfig } from "../types.js";
import { getVideoFileSize } from "./youtube.js";
import { logger } from "./logger.js";

export type ProgressCallback = (progress: PipelineProgress) => void;

/**
 * Check whether a single video passes duration and size limits.
 */
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

/**
 * Iterate through a channel's video list and return the first X valid videos.
 */
export async function selectValidVideos(
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
