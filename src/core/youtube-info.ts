/* v8 ignore start */
import type { VideoInfo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { execYtDlp, getYtDlpBaseArgs, withCookies } from "./youtube-base.js";

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

      if (!raw) throw new Error("Parse failed");

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
 * Estimate remote video file size (bytes).
 */
export async function getVideoFileSize(url: string, config: PipelineConfig): Promise<number | null> {
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
