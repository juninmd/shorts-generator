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

  const args: string[] = [
    "--no-check-certificates",
    "--extractor-args",
    "youtube:player_client=tv,android,web",
    "--js-runtimes",
    "node",
  ];

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
    const spawnEnv = {
      ...process.env,
      ...options.env,
      YTDLP_JS_EXECUTABLE: "node", // Force yt-dlp to use Node.js for EJS challenges
    };
    return (await execFileAsync("yt-dlp", args, { ...options, env: spawnEnv, encoding: "utf8" })) as unknown as {
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
      stderr: stderr.split("\n").filter((l: string) => {
        const lower = l.toLowerCase();
        return lower.includes("error") || lower.includes("warning");
      }).join("\n"),
      message: safeMessage
    }, "yt-dlp execution failed");
    throw error;
  }
}

/**
 * Perform a pre-flight check to see if YouTube is blocking us.
 * Returns true if okay, throws error if blocked.
 */
export async function verifyYoutubeAccess(config: PipelineConfig): Promise<void> {
  logger.info("Performing YouTube access sanity check...");
  
  // Use Big Buck Bunny - very standard video for tests
  const testUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
  
  return withCookies(config, async (tempCookiePath) => {
    try {
      // Try to get available formats. 
      // If we can't even see formats, the actual download will 100% fail.
      const { stdout } = await execYtDlp([
        ...getYtDlpBaseArgs(config, tempCookiePath),
        "--list-formats",
        "--no-playlist",
        "--no-warnings",
        "--",
        testUrl
      ], { timeout: 45_000 });
      
      // If we see IDs in the output, it means we reached the format list
      if (stdout.includes("ID") && stdout.includes("EXT")) {
        logger.info("YouTube format access check passed.");
        return;
      }
      throw new Error("YouTube formats not found in response.");
    } catch (error: any) {
      const msg = error.stderr || error.message || "";
      const lowerMsg = msg.toLowerCase();
      
      if (lowerMsg.includes("sign in to confirm you are not a bot") || 
          lowerMsg.includes("confirm your age") ||
          lowerMsg.includes("403: forbidden") ||
          lowerMsg.includes("blocked") ||
          lowerMsg.includes("unsupported url")) {
        throw new Error("YouTube is blocking this environment (Bot Detection). Update your YOUTUBE_COOKIES_BASE64.");
      }
      
      // If it's a format error, it's pretty much a block in GH Actions
      if (lowerMsg.includes("no video formats found")) {
        throw new Error("YouTube is blocking streaming access from this IP. (No formats found).");
      }
      
      const lines = msg.split("\n");
      const errorLine = lines.find((l: string) => l.includes("ERROR:")) || lines[0];
      throw new Error(`YouTube access check failed: ${errorLine}`);
    }
  });
}

/**
 * Get the list of recent videos from a YouTube channel.
 */
export async function getChannelVideos(
  channelIdentifier: string,
  videoLimit: number,
): Promise<VideoInfo[]> {
  logger.info({ channel: channelIdentifier, videoLimit }, "Fetching channel videos");

  return withCookies(undefined, async (tempCookiePath) => {
    try {
      const { stdout } = await execYtDlp(
        [
          ...getYtDlpBaseArgs(undefined, tempCookiePath),
          "--flat-playlist",
          "--print",
          '{"id":%(id)j,"title":%(title)j,"url":%(webpage_url)j,"channel":%(channel)j,"channel_url":%(channel_url)j,"duration":%(duration)s,"upload_date":%(upload_date)j,"thumbnail":%(thumbnail)j,"live_status":%(live_status)j}',
          "--no-warnings",
          "--ignore-errors",
          "--playlist-end",
          Math.max(videoLimit * 5, 30).toString(),
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
          // yt-dlp might return NA for missing fields, which breaks JSON.parse
          // We sanitize it to null
          const sanitizedLine = line.replace(/:NA([,}])/g, ':null$1');
          const raw = JSON.parse(sanitizedLine);
          videos.push({
            id: raw.id,
            title: raw.title ?? "Untitled",
            url: raw.url ?? `https://www.youtube.com/watch?v=${raw.id}`,
            channelName: raw.channel ?? channelIdentifier,
            channelUrl: raw.channel_url ?? "",
            duration: typeof raw.duration === "number" ? raw.duration : 0,
            publishedAt: raw.upload_date ?? "",
            thumbnailUrl: raw.thumbnail,
            liveStatus: raw.live_status,
          });
        } catch {
          logger.warn({ line }, "Failed to parse video info line");
        }
      }

      const maxDuration = 15 * 60; // 15 minutes
      const filtered = videos.filter(
        (v) => v.duration > 0 && v.duration <= maxDuration && v.liveStatus !== "is_upcoming"
      );

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
 * Get the top viewed valid non-music videos from a YouTube channel.
 */
export async function getTopChannelVideos(
  channelIdentifier: string,
  limit: number = 20,
): Promise<VideoInfo[]> {
  logger.info({ channel: channelIdentifier, limit }, "Fetching top channel videos by view count");

  return withCookies(undefined, async (tempCookiePath) => {
    try {
      const { stdout } = await execYtDlp(
        [
          ...getYtDlpBaseArgs(undefined, tempCookiePath),
          "--flat-playlist",
          "--print",
          '{"id":%(id)j,"title":%(title)j,"url":%(webpage_url)j,"channel":%(channel)j,"channel_url":%(channel_url)j,"duration":%(duration)s,"upload_date":%(upload_date)j,"thumbnail":%(thumbnail)j,"live_status":%(live_status)j,"view_count":%(view_count)j}',
          "--no-warnings",
          "--ignore-errors",
          "--playlist-end",
          "200",
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
          const sanitizedLine = line.replace(/:NA([,}])/g, ':null$1');
          const raw = JSON.parse(sanitizedLine);
          
          videos.push({
            id: raw.id,
            title: raw.title ?? "Untitled",
            url: raw.url ?? `https://www.youtube.com/watch?v=${raw.id}`,
            channelName: raw.channel ?? channelIdentifier,
            channelUrl: raw.channel_url ?? "",
            duration: typeof raw.duration === "number" ? raw.duration : 0,
            publishedAt: raw.upload_date ?? "",
            thumbnailUrl: raw.thumbnail,
            liveStatus: raw.live_status,
            viewCount: typeof raw.view_count === "number" ? raw.view_count : 0,
          });
        } catch {
          logger.warn({ line }, "Failed to parse video info line in top fetch");
        }
      }

      const maxDuration = 15 * 60; // 15 minutes max
      const filtered = videos.filter(
        (v) => v.duration > 0 && v.duration <= maxDuration && v.liveStatus !== "is_upcoming"
      );

      // Sort by viewCount descending
      filtered.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));

      logger.info(
        { channel: channelIdentifier, total: videos.length, validCandidates: filtered.length },
        "Sorted top candidates by view count",
      );
      
      return filtered.slice(0, limit * 2); // Return more to search through for non-music 
    } catch (error) {
      logger.error({ error, channel: channelIdentifier }, "Failed to fetch top channel videos");
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
          '{"id":%(id)j,"title":%(title)j,"url":%(webpage_url)j,"channel":%(channel)j,"channel_url":%(channel_url)j,"duration":%(duration)s,"upload_date":%(upload_date)j,"thumbnail":%(thumbnail)j,"live_status":%(live_status)j,"categories":%(categories)j}',
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
        liveStatus: raw.live_status,
        categories: raw.categories ?? [],
      };
    } catch (error) {
      logger.error({ error, url }, "Failed to get video info");
      return null;
    }
  });
}

/**
 * Download ONLY the audio of a video for transcription.
 * Very fast and lightweight.
 */
export async function downloadAudioOnly(
  video: VideoInfo,
  config: PipelineConfig,
): Promise<DownloadedVideo> {
  const videoDir = path.join(config.tempDir, video.id);
  fs.mkdirSync(videoDir, { recursive: true });

  const audioPath = path.join(videoDir, `${video.id}.wav`);

  logger.info({ videoId: video.id, title: video.title }, "Downloading audio only for transcription");

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
      logger.info({ videoId: video.id, sizeKB: (stats.size / 1024).toFixed(0) }, "Audio downloaded and converted");

      return {
        ...video,
        filePath: "", // No video file yet
        audioPath,
        fileSize: stats.size,
      };
    } catch (err: any) {
      logger.error({ videoId: video.id, error: err.message }, "Failed to download audio");
      throw err;
    }
  });
}

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
      "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/bestvideo[height<=720]+bestaudio/best[height<=720]/best",
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
