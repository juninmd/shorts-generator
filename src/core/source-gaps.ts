export interface Interval { startTime: number; endTime: number }

export const MIN_GAP_SECONDS = 30;
export const MAX_GAPS = 6;

/** Stretches of the source (>= 30s) no candidate has covered yet, longest first, capped at six. */
export function findUnproposedGaps(
  duration: number,
  proposed: Interval[],
  minGap = MIN_GAP_SECONDS,
  maxGaps = MAX_GAPS,
): Interval[] {
  const sorted = [...proposed].sort((a, b) => a.startTime - b.startTime);
  const gaps: Interval[] = [];
  let cursor = 0;
  for (const interval of sorted) {
    if (interval.startTime - cursor >= minGap) gaps.push({ startTime: cursor, endTime: interval.startTime });
    cursor = Math.max(cursor, interval.endTime);
  }
  if (duration - cursor >= minGap) gaps.push({ startTime: cursor, endTime: duration });
  return gaps
    .sort((a, b) => (b.endTime - b.startTime) - (a.endTime - a.startTime))
    .slice(0, maxGaps)
    .sort((a, b) => a.startTime - b.startTime);
}

/** Overlap in seconds between two intervals (0 when disjoint). */
export function overlapSeconds(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.endTime, b.endTime) - Math.max(a.startTime, b.startTime));
}
