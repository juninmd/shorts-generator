


import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { PipelineConfig, GeneratedShort } from "../types.js";
import { uploadToYouTube } from "./youtube.service.js";
import { notifyYoutubeRateLimited, notifyYoutubeResumed } from "./telegram.js";
import { isDailyLimitReachedAsync, incrementDailyUploadCountAsync, getDailyUploadCountAsync } from "./state.js";
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
    const password = process.env.REDIS_PASSWORD || undefined;

    redisClient = url ? new Redis(url, { password, maxRetriesPerRequest: null }) : new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password,
      maxRetriesPerRequest: null,
    });
  }
  return redisClient;

}

export const getQueue = () => new Queue<YoutubeUploadJobData>(QUEUE_NAME, { connection: getRedisClient() as any });

// One hour: used to defer jobs blocked by the daily channel limit so the next
// attempt lands after the limit window rolls over instead of burning retries.
const DAILY_LIMIT_DEFER_MS = 60 * 60 * 1000;

// Redis marker set while a channel is rate-limited, so the first successful
// upload afterwards can announce that publishing resumed.
const pausedKey = (channelId: string) => `youtube:paused:${channelId}`;

export async function enqueueYoutubeUpload(
  short: Pick<GeneratedShort, "id" | "outputPath">, title: string, description: string, config: PipelineConfig, tags?: string[]
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
      // Don't consume retry attempts on a quota wall — re-enqueue with a delay so
      // the clip stays accumulated on the PVC and is retried after the limit resets.
      await getQueue().add(job.name as any, job.data, {
        delay: DAILY_LIMIT_DEFER_MS,
        attempts: 5,
        backoff: { type: "exponential", delay: 60000 },
      });
      // Mark the channel as paused so the first successful upload after the
      // limit resets can announce that publishing resumed.
      await getRedisClient().set(pausedKey(channelId), "1", "EX", 60 * 60 * 48);
      logger.warn({ jobId: job.id, channelId }, "⚠️ Limite diário atingido. Reagendado para +1h (acumulado no PVC).");
      return { deferred: true };
    }
    const youtubeUrl = await uploadToYouTube(videoPath, title, description, config, tags);
    if (!youtubeUrl) throw new Error("Upload falhou (retornou null)");
    await incrementDailyUploadCountAsync(channelId);
    // If this channel was paused by a rate limit, the limit has now cleared:

    // announce the resume once and drop the marker.

    if (await getRedisClient().get(pausedKey(channelId))) {
      await getRedisClient().del(pausedKey(channelId));
      await notifyYoutubeResumed(config.managedRun?.channelName, config);
    }
    // Notify exactly once, on the upload that reaches the configured daily cap.
    if ((await getDailyUploadCountAsync(channelId)) === config.dailyUploadLimit) {
      await notifyYoutubeRateLimited(
        { channelName: config.managedRun?.channelName, reason: "daily-cap", limit: config.dailyUploadLimit },
        config,
      );
    }

    // Free the PVC as soon as the clip is published — backlog storage is then
    // bounded by unpublished clips only.
    try {
      fs.unlinkSync(videoPath);
      logger.info({ jobId: job.id, videoPath }, "🧹 Arquivo removido do PVC após publicação");
    } catch (err) {


      logger.warn({ jobId: job.id, videoPath, error: err instanceof Error ? err.message : String(err) }, "Não foi possível remover o arquivo do PVC após upload");

    }
    logger.info({ jobId: job.id, youtubeUrl }, "✅ Upload concluído com sucesso!");
    return { youtubeUrl };
  }, { connection: getRedisClient() as any, concurrency: 1, autorun: false });
}

export async function processQueueUntilEmpty(): Promise<void> {
  const queue = getQueue();
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const delayed = await queue.getDelayedCount();
  logger.info({ waiting, active, delayed }, "📊 Estado da fila de uploads");
  if (waiting === 0 && active === 0 && delayed === 0) return;

  // Delayed jobs (re-enqueued after a daily-cap hit) are not counted as waiting,
  // so without an explicit promote they sit in the queue forever and never
  // publish. Promote due jobs now so this run drains the accumulated backlog;
  // any job re-deferred again (cap still reached) simply returns to delayed.
  if (delayed > 0) {
    try {
      await queue.promoteJobs();
      logger.info({ delayed }, "⏫ Jobs adiados promovidos para processamento");

    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, "Falha ao promover jobs adiados");

    }
  }

  // Optional per-run publish cap: spreads the daily quota across the scheduled
  // publishing slots (e.g. 12h/15h/17h/19h) instead of bursting the whole cap
  // in the first run — back-to-back Shorts compete for the same seed audience.
  const maxPerRun = parseInt(process.env.MAX_UPLOADS_PER_RUN || "0", 10);

  const worker = createWorker();
  return new Promise<void>((resolve, reject) => {
    let activeJobs = 0;
    let published = 0;
    const finish = async () => {
      await worker.close();
      resolve();
    };
    worker.on("active", () => activeJobs++);
    const checkDone = async () => {
      if ((await queue.getWaitingCount()) === 0 && activeJobs === 0) {
        await finish();
      }
    };
    worker.on("completed", async (job) => {
      activeJobs--;
      logger.info({ jobId: job.id }, "Job concluído.");
      if ((job.returnvalue as { youtubeUrl?: string } | undefined)?.youtubeUrl) published++;
      if (maxPerRun > 0 && published >= maxPerRun) {
        logger.info({ published, maxPerRun }, "🎯 Cap de uploads por execução atingido — o restante publica no próximo slot");
        await finish();
        return;
      }
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

/**
 * Re-queue failed upload jobs whose source video still exists on the PVC, then
 * drain the queue. Jobs whose file was already cleaned are dropped (removed from
 * the failed set) so the backlog doesn't keep retrying dead references.
 */
export async function retryFailedWithExistingFiles(): Promise<void> {
  const queue = getQueue();
  const failed = await queue.getFailed();
  let retried = 0;
  let dropped = 0;
  for (const job of failed) {
    const videoPath = job.data?.videoPath;
    if (videoPath && fs.existsSync(videoPath)) {
      await job.retry();
      retried++;
    } else {
      await job.remove();
      dropped++;
    }
  }
  logger.info({ retried, dropped, total: failed.length }, "♻️ Jobs falhados reprocessados (arquivo presente) / descartados (arquivo ausente)");

  if (retried > 0) {
    await processQueueUntilEmpty();
  }

}

export async function closeQueueConnections(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}


