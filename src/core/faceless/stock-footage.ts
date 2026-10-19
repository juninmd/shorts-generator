import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";

const PEXELS_SEARCH_URL = "https://api.pexels.com/videos/search";

interface PexelsFile { file_type: string; width: number; height: number; link: string }
interface PexelsVideo { id: number; video_files: PexelsFile[] }

export interface FootageClip { id: number; url: string }

/** Portrait mp4 closest to 1080px wide; landscape files are accepted as a last resort. */
function bestFile(files: PexelsFile[]): PexelsFile | undefined {
  return files
    .filter((file) => file.file_type === "video/mp4")
    .sort((a, b) => score(a) - score(b))[0];
}

function score(file: PexelsFile): number {
  return Math.abs(file.width - 1080) + (file.height >= file.width ? 0 : 10_000);
}

/** First unused portrait stock clip matching the query, or null (no key, no hit, API error). */
export async function searchStockFootage(
  query: string,
  apiKey: string | undefined,
  usedIds: Set<number>,
): Promise<FootageClip | null> {
  if (!apiKey) return null;
  try {
    const url = `${PEXELS_SEARCH_URL}?${new URLSearchParams({ query, orientation: "portrait", per_page: "10" })}`;
    const response = await fetch(url, { headers: { Authorization: apiKey } });
    if (!response.ok) throw new Error(`Pexels responded ${response.status}`);
    const { videos } = await response.json() as { videos: PexelsVideo[] };
    for (const video of videos) {
      const file = bestFile(video.video_files);
      if (file && !usedIds.has(video.id)) return { id: video.id, url: file.link };
    }
  } catch (err) {
    logger.warn({ query, err: err instanceof Error ? err.message : String(err) }, "Stock footage search failed");
  }
  return null;
}

export async function downloadFootage(url: string, destination: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Footage download failed: ${response.status}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  return destination;
}

/** Searches and downloads footage for one scene; null when the caller should use a fallback card. */
export async function fetchSceneFootage(
  query: string,
  destination: string,
  apiKey: string | undefined,
  usedIds: Set<number>,
): Promise<string | null> {
  const clip = await searchStockFootage(query, apiKey, usedIds);
  if (!clip) return null;
  try {
    const file = await downloadFootage(clip.url, destination);
    usedIds.add(clip.id);
    return file;
  } catch (err) {
    logger.warn({ query, err: err instanceof Error ? err.message : String(err) }, "Stock footage download failed");
    return null;
  }
}
