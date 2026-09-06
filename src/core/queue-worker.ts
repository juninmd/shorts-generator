
import { Worker } from "bullmq";
import fs from "node:fs";
import { logger } from "./logger.js";
import { uploadToYouTube } from "./youtube.service.js";
import { notifyYoutubeRateLimited, notifyYoutubeResumed } from "./telegram.js";
import { isDailyLimitReachedAsync, incrementDailyUploadCountAsync, getDailyUploadCountAsync } from "./state.js";
import { getRedisClient, getQueue, QUEUE_NAME, type YoutubeUploadJobData } from "./queue-client.js";

const DAILY_LIMIT_DEFER_MS = 60 * 60 * 1000;
const pausedKey = (channelId: string) => `youtube:paused:${channelId}`;

export function createWorker(): Worker<YoutubeUploadJobData> {
  return new Worker<YoutubeUploadJobData>(QUEUE_NAME, async (job) => {
    const { videoPath, title, description, tags, channelId, config } = job.data;
    logger.info({ jobId: job.id, videoPath, channelId }, "🔄 Processando upload enfileirado...");
    if (!fs.existsSync(videoPath)) {
      logger.error({ jobId: job.id, videoPath }, "❌ Vídeo não encontrado. Abortando.");
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
      await getQueue().add(job.name as any, job.data, { delay: DAILY_LIMIT_DEFER_MS, attempts: 5, backoff: { type: "exponential", delay: 60000 } });
      await getRedisClient().set(pausedKey(channelId), "1", "EX", 60 * 60 * 48);
      logger.warn({ jobId: job.id, channelId }, "⚠️ Limite diário atingido. Reagendado para +1h (acumulado no PVC).");
      return { deferred: true };
    }
    const youtubeUrl = await uploadToYouTube(videoPath, title, description, config, tags);
    if (!youtubeUrl) throw new Error("Upload falhou (retornou null)");
    await incrementDailyUploadCountAsync(channelId);
    if (await getRedisClient().get(pausedKey(channelId))) {
      await getRedisClient().del(pausedKey(channelId));
      await notifyYoutubeResumed(config.managedRun?.channelName, config);
    }
    if ((await getDailyUploadCountAsync(channelId)) === config.dailyUploadLimit) {
      await notifyYoutubeRateLimited({ channelName: config.managedRun?.channelName, reason: "daily-cap", limit: config.dailyUploadLimit }, config);
    }
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
  if (delayed > 0) {
    try {
      await queue.promoteJobs();
      logger.info({ delayed }, "⏫ Jobs adiados promovidos para processamento");
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : String(err) }, "Falha ao promover jobs adiados");
    }
  }

  const maxPerRun = parseInt(process.env.MAX_UPLOADS_PER_RUN || "0", 10);
  const worker = createWorker();
  return new Promise<void>((resolve, reject) => {
    let activeJobs = 0;
    let published = 0;
    const finish = async () => { await worker.close(); resolve(); };
    worker.on("active", () => activeJobs++);
    const checkDone = async () => { if ((await queue.getWaitingCount()) === 0 && activeJobs === 0) await finish(); };
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
    worker.on("failed", async (job, err) => { activeJobs--; logger.error({ jobId: job?.id, error: err.message }, "Falha no job."); await checkDone(); });
    worker.on("error", (err) => logger.error({ error: err.message }, "Erro BullMQ"));
    worker.run().catch(reject);
    setTimeout(async () => { logger.warn("Timeout (10min) atingido. Fechando worker."); await worker.close(); resolve(); }, 600_000).unref();
  });
}

export async function retryFailedWithExistingFiles(): Promise<void> {
  const queue = getQueue();
  const failed = await queue.getFailed();
  let retried = 0;
  let dropped = 0;
  for (const job of failed) {
    const videoPath = job.data?.videoPath;
    if (videoPath && fs.existsSync(videoPath)) { await job.retry(); retried++; }
    else { await job.remove(); dropped++; }
  }
  logger.info({ retried, dropped, total: failed.length }, "♻️ Jobs falhados reprocessados (arquivo presente) / descartados (arquivo ausente)");
  if (retried > 0) await processQueueUntilEmpty();
}

