import { Queue } from "bullmq";
import { getRedisClient } from "../queue-client.js";
import type { QueueLike } from "../publication/publication-queue.js";

export const RUN_QUEUE = "pipeline-runs";

/** Reference-only payload: the worker resolves channel config and credentials when it runs. */
export interface RunJobData {
  readonly runId: string;
  readonly channelId: string;
}

let queue: Queue<RunJobData> | null = null;

export function getRunQueue(): QueueLike<RunJobData> {
  queue ??= new Queue<RunJobData>(RUN_QUEUE, { connection: getRedisClient() as never });
  return queue as unknown as QueueLike<RunJobData>;
}

export async function enqueueRun(data: RunJobData, attempt: string | number = 0, runQueue: QueueLike<RunJobData> = getRunQueue()): Promise<void> {
  await runQueue.add("run", data, {
    // Stable id per attempt: the same run cannot be queued twice concurrently.
    jobId: `run-${data.runId}-${attempt}`,
    attempts: 2,
    backoff: { type: "exponential", delay: 120_000 },
    removeOnComplete: 500,
    removeOnFail: 500,
  });
}
