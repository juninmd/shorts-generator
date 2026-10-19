import type { FocusKeyframe } from "./focus-keyframes.js";
import type { BrollCue, ShortClip, TranscriptSegment, TranscriptWord } from "../types.js";

/** A stretch of the clip (seconds from its start) that survives editing. */
export interface KeepRange {
  start: number;
  end: number;
}

const FILLERS = new Set([
  "eh", "ehh", "ehhh", "eeh", "ahn", "ahnn", "ahh", "hã", "uh", "uhh", "uhm", "umm", "hum", "hmm", "hmmm", "hm", "er", "erm", "ãh",
]);
const MAX_SILENCE = 0.45;
const BREATH = 0.12;
const FILLER_PAD = 0.03;
const MIN_TOTAL_REMOVED = 0.5;
const MAX_REMOVALS = 40;

const isFiller = (word: string): boolean => FILLERS.has(word.toLowerCase().replace(/[^\p{L}]/gu, ""));

interface Removal { start: number; end: number }

/** Dead air between kept words, plus any filler word sitting in the gap, as removals. */
function findRemovals(words: TranscriptWord[], duration: number): Removal[] {
  const kept = words.filter((word) => !isFiller(word.word));
  if (kept.length === 0) return [];
  const removals: Removal[] = [];
  const lead = kept[0]!.start - 0.15;
  if (lead > 0.25) removals.push({ start: 0, end: lead });
  kept.slice(1).forEach((next, index) => {
    const previous = kept[index]!;
    const gap = next.start - previous.end;
    const hasFiller = words.some((word) => isFiller(word.word) && word.start >= previous.end - 0.01 && word.end <= next.start + 0.01);
    const margin = hasFiller ? FILLER_PAD : BREATH;
    if ((gap > MAX_SILENCE || hasFiller) && gap - 2 * margin >= 0.12) {
      removals.push({ start: previous.end + margin, end: next.start - margin });
    }
  });
  const tail = kept.at(-1)!.end + 0.35;
  if (duration - tail > 0.3) removals.push({ start: tail, end: duration });
  return removals;
}

/**
 * Ranges to keep after dropping long pauses and filler words ("eh", "hmm"…).
 * Returns the single full range when the edit would save under half a second.
 */
export function planCuts(words: TranscriptWord[], duration: number): KeepRange[] {
  const removals = findRemovals(words, duration)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, MAX_REMOVALS)
    .sort((a, b) => a.start - b.start);
  const removed = removals.reduce((sum, removal) => sum + removal.end - removal.start, 0);
  if (removed < MIN_TOTAL_REMOVED) return [{ start: 0, end: duration }];
  const ranges: KeepRange[] = [];
  let cursor = 0;
  for (const removal of removals) {
    if (removal.start > cursor) ranges.push({ start: cursor, end: removal.start });
    cursor = removal.end;
  }
  if (cursor < duration) ranges.push({ start: cursor, end: duration });
  return ranges;
}

export const totalDuration = (ranges: KeepRange[]): number =>
  ranges.reduce((sum, range) => sum + range.end - range.start, 0);

/** Original clip time -> edited time; times inside a removed stretch snap to the cut point. */
export function remapTime(time: number, ranges: KeepRange[]): number {
  let offset = 0;
  for (const range of ranges) {
    if (time < range.start) return offset;
    if (time <= range.end) return offset + time - range.start;
    offset += range.end - range.start;
  }
  return offset;
}

const insideRanges = (start: number, end: number, ranges: KeepRange[]): boolean =>
  ranges.some((range) => start >= range.start - 0.02 && end <= range.end + 0.02);

/** The clip as it plays after cutting: words, segments, B-roll cues and duration on the new timeline. */
export function remapClip(clip: ShortClip, ranges: KeepRange[]): ShortClip {
  const words: TranscriptWord[] = clip.words
    .filter((word) => !isFiller(word.word) && insideRanges(word.start, word.end, ranges))
    .map((word) => ({ ...word, start: remapTime(word.start, ranges), end: remapTime(word.end, ranges) }));
  const transcript: TranscriptSegment[] = clip.transcript.map((segment) => ({
    ...segment, start: remapTime(segment.start, ranges), end: remapTime(segment.end, ranges),
  }));
  const broll: BrollCue[] | undefined = clip.broll?.map((cue) => ({ ...cue, at: remapTime(cue.at, ranges) }));
  return { ...clip, words, transcript, broll, duration: totalDuration(ranges) };
}

/** Tracker keyframes on the edited timeline (one per instant; the later keyframe wins). */
export function remapKeyframes(keyframes: FocusKeyframe[], ranges: KeepRange[]): FocusKeyframe[] {
  const mapped = keyframes.map((keyframe) => ({ ...keyframe, t: remapTime(keyframe.t, ranges) }));
  return mapped.filter((keyframe, index) => mapped[index + 1]?.t !== keyframe.t);
}

/** Cut plan for a clip, or undefined when SILENCE_CUT=false or there is nothing worth cutting. */
export function cutRanges(clip: Pick<ShortClip, "words" | "duration">): KeepRange[] | undefined {
  if (process.env.SILENCE_CUT === "false" || clip.words.length === 0) return undefined;
  const ranges = planCuts(clip.words, clip.duration);
  return ranges.length > 1 || ranges[0]!.start > 0 || ranges[0]!.end < clip.duration ? ranges : undefined;
}
