import { logger } from "./logger.js";
import { Redis } from "ioredis";

// Optional Redis client setup
const redisUrl = process.env.REDIS_URL;
const redis = redisUrl ? new Redis(redisUrl) : null;

if (redis) {
  redis.on("error", (error) => {
    logger.error({ error }, "Redis connection error");
  });
}

// In-memory fallbacks
const inMemoryPosted = new Set<string>();
let inMemoryDailyUploadState = { date: new Date().toISOString().slice(0, 10), count: 0 };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getPostedTopVideos(): Promise<string[]> {
  /* v8 ignore start */
  if (redis) {
    try {
      return await redis.smembers("posted_top_videos");
    } catch (error) {
      logger.error({ error }, "Failed to read posted top videos from Redis");
      return [];
    }
  }
  return Array.from(inMemoryPosted);
  /* v8 ignore stop */
}

export async function markVideoAsPosted(videoId: string): Promise<void> {
  /* v8 ignore start */
  if (redis) {
    try {
      await redis.sadd("posted_top_videos", videoId);
      logger.debug({ videoId }, "Marked video as posted in Redis");
    } catch (error) {
      logger.error({ error }, "Failed to save posted top videos state to Redis");
    }
  } else {
    inMemoryPosted.add(videoId);
    logger.debug({ videoId }, "Marked video as posted in memory");
  }
  /* v8 ignore stop */
}

export async function getDailyUploadCount(): Promise<number> {
  /* v8 ignore start */
  const today = todayISO();
  if (redis) {
    try {
      const countStr = await redis.get(`daily_uploads:${today}`);
      return countStr ? parseInt(countStr, 10) : 0;
    } catch (error) {
      logger.error({ error }, "Failed to read daily upload count from Redis");
      return 0;
    }
  }
  
  if (inMemoryDailyUploadState.date !== today) {
    inMemoryDailyUploadState = { date: today, count: 0 };
  }
  return inMemoryDailyUploadState.count;
  /* v8 ignore stop */
}

export async function isDailyLimitReached(limit: number): Promise<boolean> {
  const count = await getDailyUploadCount();
  return count >= limit;
}

export async function incrementDailyUploadCount(): Promise<void> {
  /* v8 ignore start */
  const today = todayISO();
  if (redis) {
    try {
      const key = `daily_uploads:${today}`;
      await redis.incr(key);
      await redis.expire(key, 86400 * 2); // Expire after 2 days
      logger.debug({ date: today }, "Daily YouTube upload count updated in Redis");
    } catch (error) {
      logger.error({ error }, "Failed to update daily upload count in Redis");
    }
  } else {
    if (inMemoryDailyUploadState.date !== today) {
      inMemoryDailyUploadState = { date: today, count: 0 };
    }
    inMemoryDailyUploadState.count += 1;
    logger.debug({ date: today, count: inMemoryDailyUploadState.count }, "Daily YouTube upload count updated in memory");
  }
  /* v8 ignore stop */
}
