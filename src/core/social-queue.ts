import { Queue, Worker } from "bullmq";
import { nanoid } from "nanoid";
import fs from "node:fs";
import path from "node:path";
import type { GeneratedShort, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { nextPeakSlot } from "./publish-schedule.js";
import { configuredPublishers } from "./publishers/index.js";
import { getRedisClient } from "./queue-client.js";
import { pruneSocialFiles, publishSocialPost, socialDir, type SocialPostJobData } from "./social-publish.js";
import { buildSocialCopy, type SocialMeta } from "./social-copy.js";

export const SOCIAL_QUEUE_NAME = "social-posts";

export const getSocialQueue = () => new Queue<SocialPostJobData>(SOCIAL_QUEUE_NAME, { connection: getRedisClient() as any });

let slotCounter = 0;

/**
 * Queues one post per configured platform. The video is copied to an
 * unguessable file name (so pull-based platforms can fetch it from
 * /public/social/…) and each job is delayed to the next free peak-hour slot
 * (PEAK_HOURS / PUBLISH_TZ); SOCIAL_SCHEDULE=false posts at the next queue run.
 * Returns how many posts were queued.
 */
export async function enqueueSocialPosts(
  short: Pick<GeneratedShort, "id" | "outputPath">,
  meta: SocialMeta,
  config: PipelineConfig,
): Promise<number> {
  const publishers = configuredPublishers().filter((publisher) => {
    const usable = !publisher.needsPublicUrl || Boolean(config.serverPublicUrl);
    if (!usable) logger.warn({ platform: publisher.name }, "SERVER_PUBLIC_URL ausente — plataforma exige URL pública, ignorando");
    return usable;
  });
  if (publishers.length === 0) return 0;
  const publicName = `${nanoid(24)}.mp4`;
  fs.mkdirSync(socialDir(config), { recursive: true });
  fs.copyFileSync(short.outputPath, path.join(socialDir(config), publicName));
  const now = new Date();
  const delay = process.env.SOCIAL_SCHEDULE === "false" ? 0 : nextPeakSlot(now, slotCounter++).getTime() - now.getTime();
  const queue = getSocialQueue();
  for (const publisher of publishers) {
    const data: SocialPostJobData = {
      platform: publisher.name,
      publicName,
      copy: buildSocialCopy(publisher.name, meta),
      outputDir: config.outputDir,
      serverPublicUrl: config.serverPublicUrl,
    };
    await queue.add(`social-${short.id}-${publisher.name}` as any, data, {
      delay,
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
    });
  }
  logger.info({ clipId: short.id, platforms: publishers.map((p) => p.name), delayMs: delay }, "📥 Posts sociais enfileirados");
  return publishers.length;
}

/** Publishes the posts that are due (delayed ones wait for their peak slot) and then exits. */
export async function processSocialQueue(config: Pick<PipelineConfig, "outputDir">): Promise<void> {
  const queue = getSocialQueue();
  if ((await queue.getWaitingCount()) + (await queue.getActiveCount()) > 0) {
    const worker = new Worker<SocialPostJobData>(SOCIAL_QUEUE_NAME, (job) => publishSocialPost(job.data), {
      connection: getRedisClient() as any, concurrency: 1, autorun: false,
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => void worker.close().then(() => resolve()), 600_000);
      timer.unref();
      const settle = async () => {
        if ((await queue.getWaitingCount()) + (await queue.getActiveCount()) === 0) {
          clearTimeout(timer);
          await worker.close();
          resolve();
        }
      };
      worker.on("completed", settle);
      worker.on("failed", (job, error) => {
        logger.error({ jobId: job?.id, error: error.message }, "Falha ao publicar em rede social");
        return settle();
      });
      worker.on("error", (error) => logger.error({ error: error.message }, "Erro BullMQ (social)"));
      worker.run().catch(reject);
    });
  }
  pruneSocialFiles(config);
}
