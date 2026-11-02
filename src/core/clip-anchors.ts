import type { TranscriptSegment } from "../types.js";
import type { ClipItem } from "./analyzer-schema.js";

const norm = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Segment whose text is the quoted sentence (exact or contained), searched near the claimed interval. */
function findSegment(segments: TranscriptSegment[], quote: string, from: number, to: number): number {
  const target = norm(quote);
  if (!target) return -1;
  return segments.findIndex((segment) => {
    if (segment.end < from - 2 || segment.start > to + 2) return false;
    const text = norm(segment.text);
    return text === target || text.includes(target) || target.includes(text);
  });
}

/**
 * Resolves hookText/payoffText to real transcript rows. A quote that matches no row inside
 * the interval is discarded (never trusted); resolved anchors widen the cut to include them.
 */
export function resolveAnchors(clip: ClipItem, segments: TranscriptSegment[]): ClipItem {
  const hook = clip.hookText ? findSegment(segments, clip.hookText, clip.startTime, clip.endTime) : -1;
  const payoff = clip.payoffText ? findSegment(segments, clip.payoffText, clip.startTime, clip.endTime) : -1;
  const ordered = hook === -1 || payoff === -1 || hook <= payoff;
  const useHook = hook !== -1 && ordered;
  const usePayoff = payoff !== -1 && ordered;
  return {
    ...clip,
    hookText: useHook ? clip.hookText : undefined,
    payoffText: usePayoff ? clip.payoffText : undefined,
    hookSegment: useHook ? hook : undefined,
    payoffSegment: usePayoff ? payoff : undefined,
    startTime: useHook ? Math.min(clip.startTime, segments[hook]!.start) : clip.startTime,
    endTime: usePayoff ? Math.max(clip.endTime, segments[payoff]!.end) : clip.endTime,
  };
}
