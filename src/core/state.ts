import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

const STATE_FILE_PATH = path.resolve(process.cwd(), "posted_top_videos.json");
const DAILY_UPLOADS_PATH = path.resolve(process.cwd(), "daily_uploads.json");

export function getPostedTopVideos(): string[] {
  /* v8 ignore start */
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const data = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error({ error }, "Failed to read posted top videos state");
  }
  return [];
  /* v8 ignore stop */
}

export function markVideoAsPosted(videoId: string): void {
  /* v8 ignore start */
  try {
    const posted = new Set(getPostedTopVideos());
    posted.add(videoId);
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(Array.from(posted), null, 2));
    logger.debug({ videoId }, "Marked video as posted in state file");
  } catch (error) {
    logger.error({ error }, "Failed to save posted top videos state");
  }
  /* v8 ignore stop */
}

// ─── Daily YouTube upload tracking ───────────────────────────────────────────

interface DailyUploadState {
  date: string; // YYYY-MM-DD
  count: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function readDailyState(): DailyUploadState {
  /* v8 ignore start */
  try {
    if (fs.existsSync(DAILY_UPLOADS_PATH)) {
      const data = JSON.parse(fs.readFileSync(DAILY_UPLOADS_PATH, "utf-8")) as DailyUploadState;
      if (data.date === todayISO()) return data;
    }
  } catch {
    // ignore, fall through to default
  }
  return { date: todayISO(), count: 0 };
  /* v8 ignore stop */
}

export function getDailyUploadCount(): number {
  return readDailyState().count;
}

export function isDailyLimitReached(limit: number): boolean {
  return getDailyUploadCount() >= limit;
}

export function incrementDailyUploadCount(): void {
  /* v8 ignore start */
  try {
    const state = readDailyState();
    state.count += 1;
    fs.writeFileSync(DAILY_UPLOADS_PATH, JSON.stringify(state, null, 2));
    logger.debug({ date: state.date, count: state.count }, "Daily YouTube upload count updated");
  } catch (error) {
    logger.error({ error }, "Failed to update daily upload count");
  }
  /* v8 ignore stop */
}
