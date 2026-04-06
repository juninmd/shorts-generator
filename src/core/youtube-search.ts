import type { VideoInfo } from "../types.js";
import { logger } from "./logger.js";
import { execYtDlp, getYtDlpBaseArgs, withCookies } from "./youtube-base.js";

/**
 * Search for videos on YouTube based on a query.
 * Useful for finding guest appearances in various podcasts.
 */
export async function searchYoutubeVideos(
  query: string,
  limit: number = 5,
  minDurationSec: number = 600, // Default 10 min to avoid shorts/small clips
): Promise<VideoInfo[]> {
  logger.info({ query, limit }, "Searching YouTube");

  return withCookies(undefined, async (tempCookiePath) => {
    try {
      const { stdout } = await execYtDlp(
        [
          ...getYtDlpBaseArgs(undefined, tempCookiePath),
          "ytsearch" + limit + ":" + query,
          "--flat-playlist",
          "--print",
          '{"id":%(id)j,"title":%(title)j,"url":%(webpage_url)j,"channel":%(channel)j,"channel_url":%(channel_url)j,"duration":%(duration)s,"upload_date":%(upload_date)j,"thumbnail":%(thumbnail)j,"live_status":%(live_status)j,"view_count":%(view_count)j}',
          "--no-warnings",
          "--ignore-errors",
        ],
        { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
      );

      const videos: VideoInfo[] = [];
      for (const line of stdout.trim().split("\n")) {
        if (!line.trim()) continue;
        try {
          const sanitizedLine = line.replace(/:NA([,}])/g, ':null$1');
          const raw = JSON.parse(sanitizedLine);
          
          // Basic guest filter: check if duration is sufficient and it's not a short
          if (raw.duration >= minDurationSec) {
            videos.push({
              id: raw.id,
              title: raw.title ?? "Untitled",
              url: raw.url ?? `https://www.youtube.com/watch?v=${raw.id}`,
              channelName: raw.channel ?? "Unknown",
              channelUrl: raw.channel_url ?? "",
              duration: typeof raw.duration === "number" ? raw.duration : 0,
              publishedAt: raw.upload_date ?? "",
              thumbnailUrl: raw.thumbnail,
              liveStatus: raw.live_status,
              viewCount: typeof raw.view_count === "number" ? raw.view_count : 0,
            });
          }
        } catch { }
      }

      return videos;
    } catch (error) {
      logger.error({ error, query }, "Failed to search YouTube");
      return [];
    }
  });
}

/**
 * Radar for Catholic Guests.
 * Searches for a list of known Catholic influencers in podcasts.
 */
export async function runCatholicRadar(
  guests: string[] = [
    "Padre Paulo Ricardo",
    "Frei Gilson",
    "Padre Chrystian Shankar",
    "Padre Fábio de Melo",
    "Padre Reginaldo Manzotti",
    "Padre Marcelo Rossi",
    "Padre Leonardo Wagner",
    "Dom José Falcão de Barros",
    "Ítalo Marsili",
    "Guto (O Catequista)",
    "Bernardo Kuster"
  ],
  limitPerGuest: number = 2
): Promise<VideoInfo[]> {
  const allVideos: VideoInfo[] = [];
  
  for (const guest of guests) {
    logger.info({ guest }, "Radar scanning for guest");
    const results = await searchYoutubeVideos(`${guest} podcast`, limitPerGuest);
    allVideos.push(...results);
  }

  // Deduplicate by ID
  return Array.from(new Map(allVideos.map(v => [v.id, v])).values());
}
