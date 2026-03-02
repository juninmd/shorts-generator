import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import type { VideoInfo, DownloadedVideo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

/**
 * Get the list of recent videos from a YouTube channel.
 */
export async function getChannelVideos(
  channelIdentifier: string,
  daysBack: number,
): Promise<VideoInfo[]> {
  const dateAfter = new Date();
  dateAfter.setDate(dateAfter.getDate() - daysBack);
  const dateStr = dateAfter.toISOString().split("T")[0]!.replace(/-/g, "");

  logger.info({ channel: channelIdentifier, daysBack }, "Fetching channel videos");

  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--flat-playlist",
        "--print",
        '{"id":"%(id)s","title":"%(title)s","url":"%(webpage_url)s","channel":"%(channel)s","channel_url":"%(channel_url)s","duration":%(duration)s,"upload_date":"%(upload_date)s","thumbnail":"%(thumbnail)s"}',
        "--dateafter",
        dateStr,
        "--no-warnings",
        "--ignore-errors",
        "--playlist-end",
        "30",
        channelIdentifier.startsWith("http")
          ? channelIdentifier
          : `https://www.youtube.com/${channelIdentifier}/videos`,
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
    );

    const videos: VideoInfo[] = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        videos.push({
          id: raw.id,
          title: raw.title ?? "Untitled",
          url: raw.url ?? `https://www.youtube.com/watch?v=${raw.id}`,
          channelName: raw.channel ?? channelIdentifier,
          channelUrl: raw.channel_url ?? "",
          duration: typeof raw.duration === "number" ? raw.duration : 0,
          publishedAt: raw.upload_date ?? "",
          thumbnailUrl: raw.thumbnail,
        });
      } catch {
        logger.warn({ line }, "Failed to parse video info line");
      }
    }

    logger.info({ channel: channelIdentifier, count: videos.length }, "Found videos");
    return videos;
  } catch (error) {
    logger.error({ error, channel: channelIdentifier }, "Failed to fetch channel videos");
    return [];
  }
}

/**
 * Get video info for a specific URL.
 */
export async function getVideoInfo(url: string): Promise<VideoInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--print",
        '{"id":"%(id)s","title":"%(title)s","url":"%(webpage_url)s","channel":"%(channel)s","channel_url":"%(channel_url)s","duration":%(duration)s,"upload_date":"%(upload_date)s","thumbnail":"%(thumbnail)s"}',
        "--no-warnings",
        "--no-playlist",
        url,
      ],
      { maxBuffer: 5 * 1024 * 1024, timeout: 60_000 },
    );

    const raw = JSON.parse(stdout.trim());
    return {
      id: raw.id,
      title: raw.title ?? "Untitled",
      url: raw.url ?? url,
      channelName: raw.channel ?? "Unknown",
      channelUrl: raw.channel_url ?? "",
      duration: typeof raw.duration === "number" ? raw.duration : 0,
      publishedAt: raw.upload_date ?? "",
      thumbnailUrl: raw.thumbnail,
    };
  } catch (error) {
    logger.error({ error, url }, "Failed to get video info");
    return null;
  }
}

/**
 * Download a YouTube video (video + separated audio for transcription).
 */
export async function downloadVideo(
  video: VideoInfo,
  config: PipelineConfig,
): Promise<DownloadedVideo> {
  const videoDir = path.join(config.tempDir, video.id);
  fs.mkdirSync(videoDir, { recursive: true });

  const videoPath = path.join(videoDir, `${video.id}.mp4`);
  const audioPath = path.join(videoDir, `${video.id}.wav`);

  logger.info({ videoId: video.id, title: video.title }, "Downloading video");

  // Download video (best quality up to 1080p)
  await execFileAsync(
    "yt-dlp",
    [
      "-f",
      "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
      "--merge-output-format",
      "mp4",
      "-o",
      videoPath,
      "--no-playlist",
      "--no-warnings",
      video.url,
    ],
    { maxBuffer: 10 * 1024 * 1024, timeout: 600_000 },
  );

  // Extract audio as WAV (16kHz mono for Whisper)
  await execFileAsync(
    "ffmpeg",
    ["-i", videoPath, "-ar", "16000", "-ac", "1", "-f", "wav", "-y", audioPath],
    { maxBuffer: 5 * 1024 * 1024, timeout: 300_000 },
  );

  const stats = fs.statSync(videoPath);

  logger.info(
    { videoId: video.id, sizeMB: (stats.size / 1024 / 1024).toFixed(1) },
    "Video downloaded",
  );

  return {
    ...video,
    filePath: videoPath,
    audioPath,
    fileSize: stats.size,
  };
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
