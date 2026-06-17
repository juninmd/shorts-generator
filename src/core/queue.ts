import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { PipelineConfig, GeneratedShort } from "../types.js";
import { uploadToYouTube } from "./youtube.service.js";
import { isDailyLimitReachedAsync, incrementDailyUploadCountAsync } from "./state.js";
import { logger } from "./logger.js";
import { tryLoadControlPlaneConfig } from "./control-plane-config.js";
import { getControlPlanePool } from "./control-plane-db.js";
import { ChannelBundleRepository } from "./channel-bundle-repository.js";
import fs from "node:fs";

/**
 * Jobs carry a YouTube account snapshot captured at enqueue time. After a token
 * renewal (or for long-deferred/retried jobs) that snapshot is stale and uploads
 * fail with invalid_grant. Reload the current account from the control plane DB
 * right before publishing so the freshest token is always used.
 */
async function refreshYoutubeAccountFromDb(config: PipelineConfig, channelId: string): Promise<void> {
  if (!config.managedRun) return;
  const cp = tryLoadControlPlaneConfig();
  if (!cp) return;
  try {
    const repo = new ChannelBundleRepository(getControlPlanePool(cp) as any);
    const bundle = await repo.getBundle(channelId);
    const yt = bundle?.publishingAccounts.find((a) => a.provider === "youtube");
    if (!yt) return;
    config.managedRun.publishingAccounts = [{
      id: yt.id,
      channelId: yt.channelId,
      provider: "youtube",
      clientId: yt.clientId,
      clientSecret: yt.clientSecret,
      tokenKeyVersion: yt.encryptedToken.keyVersion,
      tokenIv: yt.encryptedToken.iv,
      tokenAuthTag: yt.encryptedToken.authTag,
      tokenCiphertext: yt.encryptedToken.ciphertext,
    }];
  } catch (e) {
    logger.warn({ channelId, error: e instanceof Error ? e.message : String(e) }, "Não foi possível atualizar a conta do YouTube a partir do banco antes do upload");
  }
}

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
      logger.warn({ jobId: job.id, channelId }, "⚠️ Limite diário atingido. Reagendado para +1h (acumulado no PVC).");
      return { deferred: true };
    }
    await refreshYoutubeAccountFromDb(config, channelId);
    const youtubeUrl = await uploadToYouTube(videoPath, title, description, config, tags);
    if (!youtubeUrl) throw new Error("Upload falhou (retornou null)");
    await incrementDailyUploadCountAsync(channelId);
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
