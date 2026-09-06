
import { Queue } from "bullmq";
import { Redis } from "ioredis";

export interface YoutubeUploadJobData {
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  channelId: string;
  config: import("../types.js").PipelineConfig;
}

export const QUEUE_NAME = "youtube-uploads";
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL;
    const password = process.env.REDIS_PASSWORD || undefined;
    redisClient = url ? new Redis(url, { password, maxRetriesPerRequest: null }) : new Redis({ host: process.env.REDIS_HOST || "localhost", port: parseInt(process.env.REDIS_PORT || "6379", 10), password, maxRetriesPerRequest: null });
  }
  return redisClient;
}

export const getQueue = () => new Queue<YoutubeUploadJobData>(QUEUE_NAME, { connection: getRedisClient() as any });

export async function closeQueueConnections(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

