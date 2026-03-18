import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { VideoInfo, DownloadedVideo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

function getYtDlpBaseArgs(config?: PipelineConfig, tempCookieFile?: string): string[] {
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
 * Helper to handle temporary cookies from Base64 env var.
 */
async function withCookies<T>(
  config: PipelineConfig | undefined,
  fn: (cookiePath?: string) => Promise<T>
): Promise<T> {
  const base64Cookies = config?.youtubeCookiesBase64 || process.env.YOUTUBE_COOKIES_BASE64;
  let tempCookiePath: string | undefined;

  if (base64Cookies) {
    const tempDir = config?.tempDir || path.join(process.cwd(), "output", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    tempCookiePath = path.join(tempDir, `cookies-${crypto.randomBytes(4).toString("hex")}.txt`);
    const cookieBuffer = Buffer.from(base64Cookies, "base64");
    fs.writeFileSync(tempCookiePath, cookieBuffer);

    const stats = fs.statSync(tempCookiePath);
    logger.debug({ path: tempCookiePath, size: stats.size }, "Temporary cookie file created");

    if (stats.size < 10) {
      logger.warn({ size: stats.size }, "Cookie file is suspiciously small, check YOUTUBE_COOKIES_BASE64 helper");
    }
  }

  try {
    return await fn(tempCookiePath);
  } finally {
    if (tempCookiePath && fs.existsSync(tempCookiePath)) {
      try {
        fs.unlinkSync(tempCookiePath);
      } catch (err) {
        logger.warn({ err, path: tempCookiePath }, "Failed to delete temp cookie file");
      }
    }
  }
}

/**
 * Execute yt-dlp with better error reporting.
 */
async function execYtDlp(args: string[], options: any = {}): Promise<{ stdout: string; stderr: string }> {
  try {
    return (await execFileAsync("yt-dlp", args, { ...options, encoding: "utf8" })) as unknown as {
      stdout: string;
      stderr: string;
    };
  } catch (error: any) {
    const stderr = error.stderr || "";
    // Redact cookie path from args if present for extra safety
    const safeArgs = args.map((arg, i) => {
      if (i > 0 && args[i - 1] === "--cookies") return "[REDACTED_COOKIE_PATH]";
      return arg;
    });

    const safeMessage = (error.message || "").replace(/cookies-[a-f0-9]+\.txt/g, "[REDACTED_COOKIE_FILE]");

    logger.error({
      args: safeArgs,
      stderr: stderr.split("\n").filter((l: string) => l.includes("ERROR") || l.includes("warning")).join("\n"),
      message: safeMessage
    }, "yt-dlp execution failed");
    throw error;
  }
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

  return withCookies(undefined, async (tempCookiePath) => {
    try {
      const { stdout } = await execYtDlp(
        [
          ...getYtDlpBaseArgs(undefined, tempCookiePath),
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

      const maxDuration = 15 * 60; // 15 minutes
      const filtered = videos.filter((v) => v.duration > 0 && v.duration <= maxDuration);

      logger.info(
        { channel: channelIdentifier, total: videos.length, filtered: filtered.length },
        "Found videos (filtered by 15m duration)",
      );
      return filtered;
    } catch (error) {
      logger.error({ error, channel: channelIdentifier }, "Failed to fetch channel videos");
      return [];
    }
  });
}

/**
 * Get video info for a specific URL.
 */
export async function getVideoInfo(url: string): Promise<VideoInfo | null> {
  return withCookies(undefined, async (tempCookiePath) => {
    try {
      const { stdout } = await execYtDlp(
        [
          ...getYtDlpBaseArgs(undefined, tempCookiePath),
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
          } catch { }
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
    }
  });
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

  return withCookies(config, async (tempCookiePath) => {
    // 1. Get available formats
    let dynamicallySelectedFormat: string | null = null;
    try {
      logger.info({ videoId: video.id }, "Fetching available formats via --list-formats...");
      const { stdout } = await execYtDlp(
        [
          ...getYtDlpBaseArgs(config, tempCookiePath),
          "--list-formats",
          "--",
          video.url,
        ],
        { maxBuffer: 10 * 1024 * 1024, timeout: 60_000 }
      );

      const lines = stdout.trim().split('\n');
      let readingFormats = false;
      const audioIds: string[] = [];
      const videoIds: string[] = [];
      const combinedIds: string[] = [];

      for (const line of lines) {
        if (line.match(/^ID\s+EXT\s+RESOLUTION/)) {
          readingFormats = true;
          continue;
        }
        if (line.includes('---')) continue;

        if (readingFormats && line.trim()) {
          if (line.includes('mhtml') || line.includes('storyboard') || line.includes('images')) {
            continue;
          }

          const match = line.trim().match(/^([a-zA-Z0-9_\-]+)\s+/);
          if (!match) continue;

          const id = match[1];

          if (line.includes('audio only')) {
            audioIds.push(id);
          } else if (line.includes('video only')) {
            videoIds.push(id);
          } else {
            combinedIds.push(id);
          }
        }
      }

      if (audioIds.length === 0 && videoIds.length === 0 && combinedIds.length === 0) {
        logger.warn("Only storyboard formats available or no valid formats found! YouTube might be blocking the download (e.g., bot detection/cookies issue).");
      } else {
        const preferred720 = lines.find(
          (l) =>
            l.includes("mp4") &&
            !l.includes("audio only") &&
            l.includes("video only") &&
            (l.includes("720p") || l.match(/\b720\b/)) &&
            !l.match(/\bav01?\b/i) &&
            !l.match(/\bvp9\b/i),
        );

        if (preferred720) {
          const m = preferred720.trim().match(/^([a-zA-Z0-9_\-]+)\s+/);
          if (m) {
            const vid = m[1];
            const best = audioIds[audioIds.length - 1] ?? null;
            dynamicallySelectedFormat = best ? `${vid}+${best}` : vid;
          }
        } else if (videoIds.length > 0 && audioIds.length > 0) {
          dynamicallySelectedFormat = `${videoIds[videoIds.length - 1]}+${audioIds[audioIds.length - 1]}`;
        } else if (combinedIds.length > 0) {
          dynamicallySelectedFormat = combinedIds[combinedIds.length - 1];
        } else if (videoIds.length > 0) {
          dynamicallySelectedFormat = videoIds[videoIds.length - 1];
        }

        logger.info({ dynamicallySelectedFormat }, "Dynamically selected format from --list-formats");
      }
    } catch (listErr: any) {
      logger.warn({ error: listErr.message }, "Failed to parse --list-formats, proceeding with default formats...");
    }

    const formatsToTry = [];
    if (dynamicallySelectedFormat) {
      formatsToTry.push(dynamicallySelectedFormat);
    }

    formatsToTry.push(
      "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/bv*+ba/b",
      "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b",
      "bestvideo[height<=720]+bestaudio/best[height<=720]",
      "bestvideo+bestaudio/best",
      "best"
    );

    let downloaded = false;
    let lastError: any = null;

    for (const format of formatsToTry) {
      const args = [
        ...getYtDlpBaseArgs(config, tempCookiePath),
        "-f",
        format,
        "--merge-output-format",
        "mp4",
        "-o",
        outputTemplate,
        "--no-playlist",
        "--no-warnings",
        "--concurrent-fragments",
        "5",
        "--",
        video.url,
      ];

      logger.info({ format, cmd: `yt-dlp ${args.join(" ")}` }, "Trying to download video with format");

      try {
        await execYtDlp(args, { maxBuffer: 10 * 1024 * 1024, timeout: 600_000 });

        const files = fs.readdirSync(videoDir);
        const hasVideo = files.some(f => f.startsWith(video.id) && !f.endsWith(".wav") && !f.endsWith(".txt"));

        if (hasVideo) {
          downloaded = true;
          logger.info({ format }, "Video downloaded successfully with format");
          break;
        } else {
          logger.warn({ format }, "yt-dlp succeeded but no video file was found, trying next format...");
        }
      } catch (err: any) {
        lastError = err;
        logger.warn({ format, error: err.message }, "yt-dlp failed with format, trying next...");
      }
    }

    if (!downloaded) {
      throw new Error(`Failed to download video after trying all formats. Last error: ${lastError?.message || 'Unknown error'}`);
    }

    const files = fs.readdirSync(videoDir);
    const videoFileName = files.find(
      (f) => f.startsWith(video.id) && !f.endsWith(".wav") && !f.endsWith(".txt")
    );

    if (!videoFileName) {
      throw new Error("Downloaded video file not found in output directory");
    }

    const actualVideoPath = path.join(videoDir, videoFileName);

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

/**
 * Estimate remote video file size (bytes) using yt-dlp without downloading.
 * Returns null if the size cannot be determined.
 */
export async function getVideoFileSize(
  url: string,
  config: PipelineConfig,
): Promise<number | null> {
  return withCookies(config, async (tempCookiePath) => {
    try {
      const { stdout } = await execYtDlp(
        [
          ...getYtDlpBaseArgs(config, tempCookiePath),
          "--print", "%(filesize_approx)s",
          "--no-playlist",
          "--no-warnings",
          "--",
          url,
        ],
        { maxBuffer: 1 * 1024 * 1024, timeout: 30_000 },
      );

      const raw = stdout.trim();
      if (!raw || raw === "NA" || raw === "None" || raw === "null") return null;
      const size = parseInt(raw, 10);
      return isNaN(size) ? null : size;
    } catch {
      return null;
    }
  });
}
