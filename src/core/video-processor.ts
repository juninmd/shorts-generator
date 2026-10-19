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
import { loadBrandTemplate } from "./brand-template.js";
import { resolveBroll } from "./broll.js";
import { cutRanges, remapClip } from "./silence-cuts.js";
import { renderShort } from "./short-renderer.js";
import { probeFormat } from "./ffmpeg-bin.js";

/**
 * Process a single clip: cut, convert to vertical, apply subtitles.
 */

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

  // Silence/filler cuts first: captions, B-roll and the render all use the edited timeline.
  const ranges = cutRanges(clip);
  const edited = ranges ? remapClip(clip, ranges) : clip;
  const broll = await resolveBroll(edited.broll, outputDir, clip.id);
  const brand = loadBrandTemplate([config.managedRun?.channelId, config.managedRun?.channelName]);

  // Generate ASS subtitles (watermark embedded to avoid drawtext filter dependency)
  const assContent = generateASSSubtitles(
    edited,
    config.verticalWidth,
    config.verticalHeight,
    config.watermarkText || undefined,
    undefined,
    brand,
  );
  fs.writeFileSync(subtitlePath, assContent, "utf-8");

  // Process video with safe vertical framing, burnt captions and the planned edits.
  await renderShort(video.filePath, outputPath, subtitlePath, edited, config, {
    ranges,
    sourceDuration: clip.duration,
    broll,
  });

  const result: GeneratedShort = {
    id: clip.id,
    clip: edited,
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

export async function getVideoDuration(filePath: string): Promise<number> {
  const duration = parseFloat(String((await probeFormat(filePath)).duration ?? "0"));
  return isNaN(duration) ? 0 : duration;
}

/**
 * Get the presentation start timestamp of a video file.
 * Returns 0 when yt-dlp resets timestamps (merged DASH streams),
 * or the original video timestamp when timestamps are preserved (single-stream).
 */
export async function getFileStartTime(filePath: string): Promise<number> {
  try {
    const t = parseFloat(String((await probeFormat(filePath)).start_time ?? "0"));
    return isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}
