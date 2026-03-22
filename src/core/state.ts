import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

const STATE_FILE_PATH = path.resolve(process.cwd(), "posted_top_videos.json");

export function getPostedTopVideos(): string[] {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error({ error }, "Failed to read posted top videos state");
  }
  return [];
}

export function markVideoAsPosted(videoId: string): void {
  try {
    const posted = new Set(getPostedTopVideos());
    posted.add(videoId);
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(Array.from(posted), null, 2));
    logger.debug({ videoId }, "Marked video as posted in state file");
  } catch (error) {
    logger.error({ error }, "Failed to save posted top videos state");
  }
}
