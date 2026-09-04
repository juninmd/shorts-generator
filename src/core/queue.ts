import type { PipelineConfig, GeneratedShort } from "../types.js";
import { logger } from "./logger.js";
import { getQueue } from "./queue-client.js";

export * from "./queue-client.js";
export * from "./queue-worker.js";

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
