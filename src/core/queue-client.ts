
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

/** Jobs must never carry resolved credentials: the worker resolves them by channel reference. */
export function toJobConfig(config: import("../types.js").PipelineConfig): import("../types.js").PipelineConfig {
  const { youtubeAuth: _auth, onProgress: _progress, ...rest } = config;
  return { ...rest, litellmApiKey: "", telegramBotToken: "", youtubeCookiesBase64: undefined };
}

/** Re-hydrates secrets from the current environment/control plane at execution time. */
export function hydrateJobConfig(jobConfig: import("../types.js").PipelineConfig, env: NodeJS.ProcessEnv = process.env): import("../types.js").PipelineConfig {
  return {
    ...jobConfig,
    litellmApiKey: env.LITELLM_KEY ?? env.OPENAI_API_KEY ?? "",
    telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? "",
    youtubeCookiesBase64: env.YOUTUBE_COOKIES_BASE64,
    // Managed channels: getYouTubeAuth reads the current encrypted token from the DB.
    youtubeAuth: undefined,
  };
}
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

