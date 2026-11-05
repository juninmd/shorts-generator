import type { PipelineConfig, ShortClip, Transcript } from "../types.js";
import type { AudioSignals } from "./audio-signals.js";
import type { ClipItem } from "./analyzer-schema.js";
import { resolveAnchors } from "./clip-anchors.js";
import { dedupeCandidates, resolveOverlaps } from "./clip-overlap.js";
import { processClips } from "./clip-processing.js";
import { reviewClipOutcome, type ReviewOutcome } from "./clip-quality.js";
import { repairClipCandidates } from "./clip-repair.js";
import { logger } from "./logger.js";
import { findUnproposedGaps } from "./source-gaps.js";

const anchored = (clips: ClipItem[], transcript: Transcript): ClipItem[] =>
  clips.map((clip) => resolveAnchors(clip, transcript.segments));

/** Only clips already inside the allowed length compete for overlap, so an unusable cut cannot shadow its repair. */
const fitting = (clips: ClipItem[], config: PipelineConfig): ClipItem[] => clips.filter((clip) =>
  clip.endTime - clip.startTime >= config.minShortDuration
  && clip.endTime - clip.startTime <= config.maxShortDuration);

export interface SelectionResult {
  clips: ShortClip[];
  /** Trail for the run audit: what was proposed, what the reviewer said, what was recovered. */
  trail: { proposed: number; approved: number; rejected: ReviewOutcome["reasons"]; reviewer: string; rediscovered: number };
}

/**
 * Review -> (rediscovery in unexplored gaps when rejects exist and room remains) -> overlap
 * resolution -> render-ready clips. An offline reviewer never triggers repair or "bad content".
 */
export async function selectClips(
  candidatePool: ClipItem[],
  transcript: Transcript,
  config: PipelineConfig,
  maxCuts: number,
  candidateMax: number,
  signals?: AudioSignals | null,
): Promise<SelectionResult> {
  const pool = dedupeCandidates(anchored(candidatePool, transcript));
  const first = await reviewClipOutcome(pool, transcript, config);
  let approved = first.approved;
  let clips = processClips(resolveOverlaps(fitting(approved, config)), transcript, config, maxCuts, signals ?? undefined);
  let rediscovered = 0;
  const nothingPublishable = clips.length === 0 && pool.length > 0;
  if (first.status === "ok" && clips.length < maxCuts && (first.rejected.length > 0 || nothingPublishable)) {
    const gaps = findUnproposedGaps(transcript.duration, pool);
    const repaired = dedupeCandidates(anchored(
      await repairClipCandidates(nothingPublishable ? pool : first.rejected, transcript, config, candidateMax, {
        reasons: first.reasons, gaps, exclude: clips,
      }),
      transcript,
    ));
    const second = await reviewClipOutcome(repaired, transcript, config);
    rediscovered = second.approved.length;
    approved = [...approved, ...second.approved];
    clips = processClips(resolveOverlaps(fitting(approved, config)), transcript, config, maxCuts, signals ?? undefined);
    logger.info({ repaired: repaired.length, approvedRepairs: rediscovered }, "Clip rediscovery pass completed");
  }
  return {
    clips,
    trail: {
      proposed: pool.length,
      approved: clips.length,
      rejected: first.reasons,
      reviewer: first.status,
      rediscovered,
    },
  };
}
