import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { PipelineConfig, GeneratedShort } from "../types.js";
import { uploadToYouTube } from "./youtube.service.js";
import { isDailyLimitReachedAsync, incrementDailyUploadCountAsync } from "./state.js";
import { logger } from "./logger.js";
import fs from "node:fs";

export interface YoutubeUploadJobData {
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  channelId: string;
  config: PipelineConfig;
}

const QUEUE_NAME = "youtube-uploads";
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL;
    redisClient = url ? new Redis(url, { maxRetriesPerRequest: null }) : new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });
  }
  return redisClient;
}

export const getQueue = () => new Queue<YoutubeUploadJobData>(QUEUE_NAME, { connection: getRedisClient() as any });

export async function enqueueYoutubeUpload(
  short: GeneratedShort, title: string, description: string, config: PipelineConfig, tags?: string[]
): Promise<void> {
  const queue = getQueue();
  const channelId = config.managedRun?.channelId || "global";
  await queue.add(`upload-${short.id}` as any, { videoPath: short.outputPath, title, description, tags, channelId, config }, {
    attempts: 5,
    backoff: { type: "exponential", delay: 60000 },
  });
  logger.info({ clipId: short.id, videoPath: short.outputPath }, "📥 Upload do YouTube enfileirado no BullMQ");
}

export function createWorker(): Worker<YoutubeUploadJobData> {
  return new Worker<YoutubeUploadJobData>(QUEUE_NAME, async (job) => {
    const { videoPath, title, description, tags, channelId, config } = job.data;
    logger.info({ jobId: job.id, videoPath, channelId }, "🔄 Processando upload enfileirado...");
    if (!fs.existsSync(videoPath)) {
      logger.error({ jobId: job.id, videoPath }, "❌ Vídeo não encontrado. Abortando.");
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
      logger.warn({ jobId: job.id, channelId }, "⚠️ Limite diário atingido. Postergando.");
      throw new Error(`YouTube limit reached: ${channelId}`);
    }
    const youtubeUrl = await uploadToYouTube(videoPath, title, description, config, tags);
    if (!youtubeUrl) throw new Error("Upload falhou (retornou null)");
    await incrementDailyUploadCountAsync(channelId);
    logger.info({ jobId: job.id, youtubeUrl }, "✅ Upload concluído com sucesso!");
    return { youtubeUrl };
  }, { connection: getRedisClient() as any, concurrency: 1, autorun: false });
}

export async function processQueueUntilEmpty(): Promise<void> {
  const queue = getQueue();
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  logger.info({ waiting, active }, "📊 Estado da fila de uploads");
  if (waiting === 0 && active === 0) return;

  const worker = createWorker();
  return new Promise<void>((resolve, reject) => {
    let activeJobs = 0;
    worker.on("active", () => activeJobs++);
    const checkDone = async () => {
      if ((await queue.getWaitingCount()) === 0 && activeJobs === 0) {
        await worker.close();
        resolve();
      }
    };
    worker.on("completed", async (job) => {
      activeJobs--;
      logger.info({ jobId: job.id }, "Job concluído.");
      await checkDone();
    });
    worker.on("failed", async (job, err) => {
      activeJobs--;
      logger.error({ jobId: job?.id, error: err.message }, "Falha no job.");
      await checkDone();
    });
    worker.on("error", (err) => logger.error({ error: err.message }, "Erro BullMQ"));
    worker.run().catch(reject);
    setTimeout(async () => {
      logger.warn("Timeout (10min) atingido. Fechando worker.");
      await worker.close();
      resolve();
    }, 600_000).unref();
  });
}

export async function closeQueueConnections(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
