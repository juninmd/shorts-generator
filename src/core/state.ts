import fs from "node:fs";
import path from "node:path";
import { getOptionalPool, queryRows } from "./control-plane-db.js";
import { logger } from "./logger.js";

const STATE_FILE_PATH = path.resolve(process.cwd(), "posted_top_videos.json");
const DAILY_UPLOADS_PATH = path.resolve(process.cwd(), "daily_uploads.json");

export async function getPostedTopVideosAsync(): Promise<string[]> {
  const db = getOptionalPool();
  if (db) {
    const rows = await queryRows<{ video_id: string }>(
      db,
      "SELECT video_id FROM posted_source_videos ORDER BY created_at DESC",
    );
    return rows.map((row) => row.video_id);
  }
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

export async function markVideoAsPostedAsync(videoId: string): Promise<void> {
  const db = getOptionalPool();
  if (db) {
    await db.query(
      "INSERT INTO posted_source_videos (video_id) VALUES ($1) ON CONFLICT (video_id) DO NOTHING",
      [videoId],
    );
    logger.info({ videoId }, "Durable posted video state saved");
    return;
  }
  /* v8 ignore start */
  try {
    const posted = new Set(await getPostedTopVideosAsync());
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

export async function getDailyUploadCountAsync(channelId = "global"): Promise<number> {
  const db = getOptionalPool();
  if (db) {
    const rows = await queryRows<{ publish_count: number }>(
      db,
      "SELECT publish_count FROM daily_channel_quotas WHERE quota_day = CURRENT_DATE AND channel_id = $1",
      [channelId],
    );
    return rows[0]?.publish_count ?? 0;
  }
  return readDailyState().count;
}

export async function isDailyLimitReachedAsync(limit: number, channelId = "global"): Promise<boolean> {
  return (await getDailyUploadCountAsync(channelId)) >= limit;
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

export async function incrementDailyUploadCountAsync(channelId = "global"): Promise<void> {
  const db = getOptionalPool();
  if (db) {
    await db.query(
      `INSERT INTO daily_channel_quotas (quota_day, channel_id, publish_count)
       VALUES (CURRENT_DATE, $1, 1)
       ON CONFLICT (quota_day, channel_id)
       DO UPDATE SET publish_count = daily_channel_quotas.publish_count + 1`,
      [channelId],
    );
    logger.info({ channelId }, "Durable state write complete");
    return;
  }
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

