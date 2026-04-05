/* v8 ignore start */
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { VideoInfo, DownloadedVideo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { execYtDlp, getYtDlpBaseArgs, withCookies } from "./youtube-base.js";

/**
 * Download ONLY the audio of a video for transcription.
 */
export async function downloadAudioOnly(
  video: VideoInfo,
  config: PipelineConfig,
): Promise<DownloadedVideo> {
  const videoDir = path.join(config.tempDir, video.id);
  fs.mkdirSync(videoDir, { recursive: true });

  const audioPath = path.join(videoDir, `${video.id}.wav`);

  logger.info({ videoId: video.id }, "Downloading audio only");

  return withCookies(config, async (tempCookiePath) => {
    const args = [
      ...getYtDlpBaseArgs(config, tempCookiePath),
      "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
      "--extract-audio",
      "--audio-format", "wav",
      "--postprocessor-args", "ffmpeg:-ar 16000 -ac 1",
      "--no-playlist",
      "--no-warnings",
      "-o", audioPath,
      "--",
      video.url
    ];

    try {
      await execYtDlp(args, { timeout: 300_000 });
      const stats = fs.statSync(audioPath);
      return { ...video, filePath: "", audioPath, fileSize: stats.size };
    } catch (err: any) {
      logger.error({ videoId: video.id, error: err.message }, "Audio download failed");
      throw err;
    }
  });
}

/**
 * Download ONLY a specific section of the video.
 */
export async function downloadVideoSection(
  video: VideoInfo,
  startTime: number,
  endTime: number,
  config: PipelineConfig,
): Promise<string> {
  const videoDir = path.join(config.tempDir, video.id);
  fs.mkdirSync(videoDir, { recursive: true });

  const start = Math.max(0, startTime - 2);
  const end = Math.min(video.duration, endTime + 2);
  
  const sectionId = crypto.createHash("md5").update(`${start}-${end}`).digest("hex").slice(0, 6);
  const outputTemplate = path.join(videoDir, `${video.id}_${sectionId}.mp4`);

  logger.info({ videoId: video.id, start, end }, "Downloading video section");

  return withCookies(config, async (tempCookiePath) => {
    const args = [
      ...getYtDlpBaseArgs(config, tempCookiePath),
      "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/bestvideo[height<=720]+bestaudio/best[height<=720]/best",
      "--no-playlist",
      "--no-warnings",
      "--download-sections", `*${start}-${end}`,
      "--merge-output-format", "mp4",
      "-o", outputTemplate,
      "--",
      video.url
    ];

    try {
      await execYtDlp(args, { timeout: 300_000 });
      return outputTemplate;
    } catch (err: any) {
      logger.error({ videoId: video.id, error: err.message }, "Section download failed");
      throw err;
    }
  });
}

export function cleanupVideo(videoId: string, config: PipelineConfig): void {
  const videoDir = path.join(config.tempDir, videoId);
  try {
    fs.rmSync(videoDir, { recursive: true, force: true });
  } catch { }
}
