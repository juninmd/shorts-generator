/* v8 ignore start */

import type { VideoInfo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { getYtDlpBaseArgs, withCookies, execYtDlp } from "./youtube-ytdlp.js";

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
    } catch (error: unknown) {
      const msg = (error instanceof Error ? ((error as NodeJS.ErrnoException & { stderr?: string }).stderr ?? error.message) : String(error));
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let raw: Record<string, any> | null = null;
      for (const line of outputLines.reverse()) {
        const trimmed = line.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            raw = JSON.parse(trimmed.replace(/([:,]\s*)NA\b/g, '$1null'));
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


/* v8 ignore stop */
