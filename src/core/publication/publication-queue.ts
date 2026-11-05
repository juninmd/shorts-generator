import { Queue } from "bullmq";
import { getRedisClient } from "../queue-client.js";

export const PUBLICATION_QUEUE = "publications";
export const REGENERATION_QUEUE = "regenerations";

/** Jobs carry references only; credentials and config are resolved by the worker. */
export interface PublicationJobData {
  readonly publicationId: string;
  readonly version: number;
}

export interface QueueLike<T> {
  add(name: string, data: T, opts?: Record<string, unknown>): Promise<unknown>;
}

let publicationQueue: Queue<PublicationJobData> | null = null;
let regenerationQueue: Queue<PublicationJobData> | null = null;

export function getPublicationQueue(): QueueLike<PublicationJobData> {
  publicationQueue ??= new Queue<PublicationJobData>(PUBLICATION_QUEUE, { connection: getRedisClient() as never });
  return publicationQueue as unknown as QueueLike<PublicationJobData>;
}

export function getRegenerationQueue(): QueueLike<PublicationJobData> {
  regenerationQueue ??= new Queue<PublicationJobData>(REGENERATION_QUEUE, { connection: getRedisClient() as never });
  return regenerationQueue as unknown as QueueLike<PublicationJobData>;
}

// Stable job id: the same approved version can only be enqueued once.
export const publicationJobId = (id: string, version: number) => `pub-${id}-v${version}`;

export async function enqueuePublication(
  data: PublicationJobData,
  queue: QueueLike<PublicationJobData> = getPublicationQueue(),
  delayMs = 0,
): Promise<void> {
  await queue.add("publish", data, {
    jobId: publicationJobId(data.publicationId, data.version),
    delay: delayMs,
    attempts: 5,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 1000,
  });
}

export async function enqueueRegeneration(
  data: PublicationJobData,
  queue: QueueLike<PublicationJobData> = getRegenerationQueue(),
): Promise<void> {
  await queue.add("regenerate", data, {
    jobId: `regen-${data.publicationId}-v${data.version}`,
    attempts: 2,
    backoff: { type: "exponential", delay: 30_000 },
  });
}
