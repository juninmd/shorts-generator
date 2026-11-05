import { logger } from "./logger.js";

const MB = 1024 * 1024;

/** Process memory at a stage boundary; warns past MEMORY_WARN_MB (default 2048) so leaks show up in long jobs. */
export function memorySnapshot(stage: string): { rssMb: number; heapMb: number } {
  const usage = process.memoryUsage();
  const snapshot = { rssMb: Math.round(usage.rss / MB), heapMb: Math.round(usage.heapUsed / MB) };
  if (snapshot.rssMb > Number(process.env.MEMORY_WARN_MB ?? 2048)) {
    logger.warn({ stage, ...snapshot }, "High memory use");
  }
  return snapshot;
}
