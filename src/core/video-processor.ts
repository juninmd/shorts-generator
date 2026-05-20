import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import path from "node:path";
import type {
  ShortClip,
  DownloadedVideo,
  GeneratedShort,
  PipelineConfig,
} from "../types.js";
import { generateASSSubtitles } from "./subtitle.js";
import { logger } from "./logger.js";
import { renderShort } from "./short-renderer.js";

/**
 * Process a single clip: cut, convert to vertical, apply subtitles.
 */
 /* v8 ignore start */
export async function processClip(
  video: DownloadedVideo,
  clip: ShortClip,
  config: PipelineConfig,
): Promise<GeneratedShort> {
  const outputDir = path.join(config.outputDir, video.id);
  fs.mkdirSync(outputDir, { recursive: true });

  const subtitlePath = path.join(outputDir, `${clip.id}.ass`);
  const outputPath = path.join(outputDir, `${clip.id}.mp4`);

  logger.info(
    {
      clipId: clip.id,
      videoId: video.id,
      channelId: config.managedRun?.channelId,
      logoPath: config.managedRun?.logoPath,
      start: clip.startTime,
      end: clip.endTime,
      duration: clip.duration,
      title: clip.title,
      viralScore: clip.viralScore,
      reason: clip.reason,
    },
    "Processing clip",
  );

  // Generate ASS subtitles (watermark embedded to avoid drawtext filter dependency)
  const assContent = generateASSSubtitles(
    clip,
    config.verticalWidth,
    config.verticalHeight,
    config.watermarkText || undefined,
  );
  fs.writeFileSync(subtitlePath, assContent, "utf-8");

  // Process video with safe vertical framing and burnt subtitles.
  await renderShort(video.filePath, outputPath, subtitlePath, clip, config);

  const result: GeneratedShort = {
    id: clip.id,
    clip,
    outputPath,
    subtitlePath,
    originalVideoUrl: video.url,
    originalVideoTitle: video.title,
    channelName: video.channelName,
    status: "completed",
    createdAt: new Date().toISOString(),
  };

  logger.info({ clipId: clip.id, outputPath }, "Clip processed successfully");
  return result;
}

/**
 * Get the duration of a video file in seconds.
 */
 /* v8 ignore stop */
export function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata?.format?.duration ?? 0);
    });
  });
}

/**
 * Get the presentation start timestamp of a video file.
 * Returns 0 when yt-dlp resets timestamps (merged DASH streams),
 * or the original video timestamp when timestamps are preserved (single-stream).
 */
export function getFileStartTime(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return resolve(0);
      const t = parseFloat(String(metadata?.format?.start_time ?? "0"));
      resolve(isNaN(t) ? 0 : t);
    });
  });
}
/* v8 ignore stop */
