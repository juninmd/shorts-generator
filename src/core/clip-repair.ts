import { z } from "zod";
import type { PipelineConfig, Transcript } from "../types.js";
import { scheduleAbort } from "./abort-timeout.js";
import { createModel } from "./ai-provider.js";
import { ClipItemSchema, type ClipItem } from "./analyzer-schema.js";
import { repairPrompt, type RepairContext } from "./clip-repair-prompt.js";
import { generateJsonObject } from "./generate-json.js";
import { logger } from "./logger.js";
import { overlapSeconds } from "./source-gaps.js";

export type { RepairContext } from "./clip-repair-prompt.js";

const RepairSchema = z.object({
  clips: z.array(ClipItemSchema.extend({
    diagnosis: z.object({
      check: z.string(),
      quote: z.string(),
      explanation: z.string().optional(),
    }).optional(),
  })),
});

const squash = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim();

/** A cited quote must exist verbatim in the transcript; invented citations void the repair. */
function citationHolds(quote: string, transcript: Transcript): boolean {
  const target = squash(quote);
  return target.length > 0 && squash(transcript.segments.map((segment) => segment.text).join(" ")).includes(target);
}

export async function repairClipCandidates(
  clips: ClipItem[],
  transcript: Transcript,
  config: PipelineConfig,
  maxClips: number,
  context: RepairContext = {},
): Promise<ClipItem[]> {
  if (clips.length === 0) return [];
  const controller = new AbortController();
  const timeoutId = scheduleAbort(controller, config.aiTimeoutMs ?? 300_000);
  try {
    const result = await generateJsonObject<z.infer<typeof RepairSchema>>({
      model: createModel(config),
      schema: RepairSchema,
      prompt: repairPrompt(
        clips, transcript, config.minShortDuration, config.maxShortDuration, maxClips, context,
      ),
      temperature: 0.4,
      maxRetries: 3,
      abortSignal: controller.signal,
    });
    return (result.clips ?? []).flatMap(({ diagnosis, ...clip }) => {
      if (diagnosis && !citationHolds(diagnosis.quote, transcript)) {
        logger.info({ title: clip.title }, "Repair dropped: cited quote is not in the transcript");
        return [];
      }
      const clashes = (context.exclude ?? []).some((done) => overlapSeconds(clip, done) > 5);
      return clashes ? [] : [clip];
    });
  } catch (error) {
    logger.error({ error }, "Clip boundary repair failed; publishing nothing");
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
