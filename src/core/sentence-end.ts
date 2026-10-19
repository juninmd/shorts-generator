import type { ShortClip, TranscriptWord } from "../types.js";

/** "." not preceded by another "." (so "..." trailing off does not count), or "!"/"?", optionally closed by quotes/brackets. */
const TERMINAL = /(?<!\.)\.["'”’)»\]]*$|[!?]["'”’)»\]]*$/;
const ABBREVIATION = /^(?:dr|dra|sr|sra|srta|mr|mrs|ms|st|prof|etc|vs|ex|nº)\.$/i;
const END_TAIL_SECONDS = 0.35;
const TOLERANCE_SECONDS = 0.3;

/** True for a word that closes a sentence ("fim.", "mesmo?", "não!”") and is not an abbreviation or ellipsis. */
export function isSentenceEnd(word: string): boolean {
  const token = word.trim();
  return TERMINAL.test(token) && !ABBREVIATION.test(token.replace(/^["'“‘(\[«]+/, ""));
}

/**
 * End time of the sentence closest to `target` within [minEnd, maxEnd], so a
 * short stops on a full stop instead of mid-thought. Ties prefer the earlier
 * sentence; a sentence already ending within 0.3s of the target keeps it.
 */
export function findSentenceEnd(
  words: TranscriptWord[],
  target: number,
  minEnd: number,
  maxEnd: number,
): number | undefined {
  const ends = words
    .filter((word) => isSentenceEnd(word.word) && word.end >= minEnd && word.end <= maxEnd)
    .map((word) => word.end);
  const nearest = ends.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
  return nearest !== undefined && Math.abs(nearest - target) <= TOLERANCE_SECONDS ? target : nearest;
}

/**
 * Render-time safety net: when the clip's last spoken word does not close a
 * sentence, cut back to the last full stop (at least half the clip, 8s minimum,
 * must survive) and leave a short breath after it. Clips without punctuation
 * or without an earlier full stop are returned untouched.
 */
export function endAtSentence(clip: ShortClip): ShortClip {
  const last = clip.words.at(-1);
  if (!last || isSentenceEnd(last.word)) return clip;
  const end = findSentenceEnd(clip.words, clip.duration, Math.max(8, clip.duration * 0.5), clip.duration);
  if (end === undefined) return clip;
  const duration = Math.min(clip.duration, end + END_TAIL_SECONDS);
  return {
    ...clip,
    duration,
    endTime: clip.startTime + duration,
    words: clip.words.filter((word) => word.end <= end + 0.01),
    transcript: clip.transcript
      .filter((segment) => segment.start < end)
      .map((segment) => ({ ...segment, end: Math.min(segment.end, duration) })),
  };
}
