import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { VideoInfo, DownloadedVideo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

function getYtDlpCookiesArgs(config?: PipelineConfig, tempCookieFile?: string): string[] {
  const browser = config?.youtubeCookiesBrowser || process.env.YOUTUBE_COOKIES_BROWSER;
  const file = tempCookieFile || config?.youtubeCookiesFile || process.env.YOUTUBE_COOKIES_FILE;

  const args: string[] = [];
  if (browser) {
    args.push("--cookies-from-browser", browser);
  } else if (file) {
    args.push("--cookies", file);
  }
  return args;
}

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

  let tempCookiePath: string | undefined;
  try {
    const base64Cookies = process.env.YOUTUBE_COOKIES_BASE64;

    if (base64Cookies) {
      tempCookiePath = path.join(process.cwd(), `cookies-${crypto.randomBytes(4).toString("hex")}.txt`);
      fs.writeFileSync(tempCookiePath, Buffer.from(base64Cookies, "base64").toString("utf-8"));
    }

    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        ...getYtDlpCookiesArgs(undefined, tempCookiePath),
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
  } finally {
    if (tempCookiePath && fs.existsSync(tempCookiePath)) {
      fs.unlinkSync(tempCookiePath);
    }
  }
}

/**
 * Get video info for a specific URL.
 */
export async function getVideoInfo(url: string): Promise<VideoInfo | null> {
  let tempCookiePath: string | undefined;
  try {
    const base64Cookies = process.env.YOUTUBE_COOKIES_BASE64;

    if (base64Cookies) {
      tempCookiePath = path.join(process.cwd(), `cookies-${crypto.randomBytes(4).toString("hex")}.txt`);
      fs.writeFileSync(tempCookiePath, Buffer.from(base64Cookies, "base64").toString("utf-8"));
    }

    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        ...getYtDlpCookiesArgs(undefined, tempCookiePath),
        "--print",
        '{"id":"%(id)s","title":"%(title)s","url":"%(webpage_url)s","channel":"%(channel)s","channel_url":"%(channel_url)s","duration":%(duration)s,"upload_date":"%(upload_date)s","thumbnail":"%(thumbnail)s"}',
        "--no-warnings",
        "--no-playlist",
        url,
      ],
      { maxBuffer: 5 * 1024 * 1024, timeout: 60_000 },
    );

    const outputLines = stdout.trim().split("\n");
    let raw: any = null;
    for (const line of outputLines.reverse()) {
      const trimmed = line.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          raw = JSON.parse(trimmed);
          break;
        } catch {}
      }
    }

    if (!raw) {
      throw new Error("Failed to parse video info from yt-dlp output");
    }

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
  } finally {
    if (tempCookiePath && fs.existsSync(tempCookiePath)) {
      fs.unlinkSync(tempCookiePath);
    }
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

  const audioPath = path.join(videoDir, `${video.id}.wav`);
  const outputTemplate = path.join(videoDir, `${video.id}.%(ext)s`);

  logger.info({ videoId: video.id, title: video.title }, "Downloading video");

  let tempCookiePath: string | undefined;
  try {
    if (config.youtubeCookiesBase64) {
      tempCookiePath = path.join(config.tempDir, `cookies-${crypto.randomBytes(4).toString("hex")}.txt`);
      fs.writeFileSync(tempCookiePath, Buffer.from(config.youtubeCookiesBase64, "base64").toString("utf-8"));
    }

    // Download video (best quality up to 1080p)
    await execFileAsync(
      "yt-dlp",
      [
        ...getYtDlpCookiesArgs(config, tempCookiePath),
        "-f",
        "bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best",
        "--merge-output-format",
        "mp4",
        "-o",
        outputTemplate,
        "--no-playlist",
        "--no-warnings",
        "--",
        video.url,
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 600_000 },
    );

    // Find the actual downloaded video file (it might not be .mp4 if it fell back to /best)
    const files = fs.readdirSync(videoDir);
    const videoFileName = files.find(
      (f) => f.startsWith(video.id) && !f.endsWith(".wav") && !f.endsWith(".txt")
    );

    if (!videoFileName) {
      throw new Error("Downloaded video file not found in output directory");
    }

    const actualVideoPath = path.join(videoDir, videoFileName);

    // Extract audio as WAV (16kHz mono for Whisper)
    await execFileAsync(
      "ffmpeg",
      ["-i", actualVideoPath, "-ar", "16000", "-ac", "1", "-f", "wav", "-y", audioPath],
      { maxBuffer: 5 * 1024 * 1024, timeout: 300_000 },
    );

    const stats = fs.statSync(actualVideoPath);

    logger.info(
      { videoId: video.id, sizeMB: (stats.size / 1024 / 1024).toFixed(1) },
      "Video downloaded",
    );

    return {
      ...video,
      filePath: actualVideoPath,
      audioPath,
      fileSize: stats.size,
    };
  } finally {
    if (tempCookiePath && fs.existsSync(tempCookiePath)) {
      fs.unlinkSync(tempCookiePath);
    }
  }
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
