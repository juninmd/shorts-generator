/* v8 ignore start */

import type { VideoInfo } from "../types.js";
import { logger } from "./logger.js";
import { getYtDlpBaseArgs, withCookies, execYtDlp } from "./youtube-ytdlp.js";

/**
 * Get the list of recent videos from a YouTube channel.
 */
export async function getChannelVideos(
  channelIdentifier: string,
  videoLimit: number,
  maxDurationSec: number = 3 * 3600,
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

      const filtered = videos.filter(
        (v) => v.duration > 0 && v.duration <= maxDurationSec && v.liveStatus !== "is_upcoming"
      );

      logger.info(
        { channel: channelIdentifier, total: videos.length, filtered: filtered.length, maxDurationSec },
        "Found videos (filtered by max duration)",
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
  maxDurationSec: number = 3 * 3600,
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

      const filtered = videos.filter(
        (v) => v.duration > 0 && v.duration <= maxDurationSec && v.liveStatus !== "is_upcoming"
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


/* v8 ignore stop */
