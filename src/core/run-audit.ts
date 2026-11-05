import path from "node:path";
import { writeJsonAtomic } from "./disk-cache.js";
import { logger } from "./logger.js";
import { memorySnapshot } from "./memory-monitor.js";

export interface VideoAudit {
  checkpoint(stage: string, detail: unknown): void;
}

/**
 * edit_audit.json for one video, rewritten atomically after every stage so a crashed or
 * zero-output run still explains itself (transcript, candidates, rejections, LLM usage).
 */
export function createVideoAudit(
  dir: string | undefined,
  video: { id: string; title: string },
): VideoAudit {
  const file = dir ? path.join(dir, "audit", video.id, "edit_audit.json") : undefined;
  const audit: Record<string, unknown> = {
    videoId: video.id, title: video.title, startedAt: new Date().toISOString(), stages: {},
  };
  return {
    checkpoint(stage, detail) {
      (audit.stages as Record<string, unknown>)[stage] = { at: new Date().toISOString(), memory: memorySnapshot(stage), ...(detail as object) };
      if (!file) return;
      try {
        writeJsonAtomic(file, audit);
      } catch (error) {
        logger.warn({ error, file }, "Could not write edit audit");
      }
    },
  };
}
