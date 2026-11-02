import type { ClipItem } from "./analyzer-schema.js";
import { overlapSeconds } from "./source-gaps.js";

/** Approved alternatives may share a breath of footage, never a whole moment. */
export const MAX_OVERLAP_SECONDS = 5;
const SAME_MOMENT_RATIO = 0.8;
const SIMILAR_HOOK = 0.8;

const words = (text: string): Set<string> => new Set(
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((word) => word.length > 3),
);

export function similarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  const total = new Set([...left, ...right]).size;
  return total === 0 ? 0 : shared / total;
}

const length = (clip: ClipItem): number => clip.endTime - clip.startTime;

/** Pre-review pool: drops only exact repeats of one moment, keeping boundary alternatives alive. */
export function dedupeCandidates(clips: ClipItem[]): ClipItem[] {
  const kept: ClipItem[] = [];
  for (const clip of [...clips].sort((a, b) => b.viralScore - a.viralScore)) {
    const repeat = kept.some((other) =>
      overlapSeconds(clip, other) >= SAME_MOMENT_RATIO * Math.min(length(clip), length(other)));
    if (!repeat) kept.push(clip);
  }
  return kept;
}

/** Post-review: best score first; later ones lose if they overlap > 5s or repeat the same hook. */
export function resolveOverlaps(approved: ClipItem[]): ClipItem[] {
  const kept: ClipItem[] = [];
  for (const clip of [...approved].sort((a, b) => b.viralScore - a.viralScore)) {
    const clash = kept.some((other) =>
      overlapSeconds(clip, other) > MAX_OVERLAP_SECONDS
      || (clip.hookText !== undefined && other.hookText !== undefined
        && similarity(clip.hookText, other.hookText) >= SIMILAR_HOOK));
    if (!clash) kept.push(clip);
  }
  return kept;
}
