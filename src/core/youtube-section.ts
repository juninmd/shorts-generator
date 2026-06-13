/* v8 ignore start */
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { VideoInfo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { getYtDlpBaseArgs, withCookies, execYtDlp } from "./youtube-ytdlp.js";

/**
 * Download ONLY a specific section of the video.
 * Uses yt-dlp's --download-sections feature.
 */
export async function downloadVideoSection(
  video: VideoInfo,
  startTime: number,
  endTime: number,
  config: PipelineConfig,
): Promise<string> {
  const videoDir = path.join(config.tempDir, video.id);
  fs.mkdirSync(videoDir, { recursive: true });

  // Add buffer to start/end to ensure we have enough context for snapping/fades
  const start = Math.max(0, startTime - 2);
  const end = Math.min(video.duration, endTime + 2);

  const sectionId = crypto.createHash("md5").update(`${start}-${end}`).digest("hex").slice(0, 6);
  const outputTemplate = path.join(videoDir, `${video.id}_${sectionId}.mp4`);

  logger.info(
    { videoId: video.id, start, end, duration: end - start },
    "Downloading video section only"
  );

  return withCookies(config, async (tempCookiePath) => {
    const args = [
      ...getYtDlpBaseArgs(config, tempCookiePath),
      "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
      "--no-playlist",
      "--no-warnings",
      "--download-sections", `*${start}-${end}`,
      // NOTE: --force-keyframes-at-cuts is intentionally disabled as it can cause ffmpeg to crash
      // with exit code -11 on certain videos. This may result in less precise cuts, so a buffer
      // is added to start/end times to allow for accurate trimming in a later step.
      "--merge-output-format", "mp4",
      "-o", outputTemplate,
      "--",
      video.url
    ];

    try {
      await execYtDlp(args, { timeout: 300_000 });
      if (!fs.existsSync(outputTemplate)) {
        throw new Error("Section download succeeded but file not found");
      }
      return outputTemplate;
    } catch (err: any) {
      logger.error({ videoId: video.id, error: err.message }, "Failed to download video section");
      throw err;
    }
  });
}

/**
 * Cleanup temporary files for a video.
 */
export function cleanupVideo(videoId: string, config: PipelineConfig): void {
  const videoDir = path.join(config.tempDir, videoId);
  try {
    fs.rmSync(videoDir, { recursive: true, force: true });
    logger.debug({ videoId }, "Cleaned up temp files");
  } catch {
    logger.warn({ videoId }, "Failed to cleanup temp files");
  }
}
/* v8 ignore stop */
