import type { TranscriptSegment } from "../types.js";

/** How far back a clip start may move to reach the beginning of its sentence. */
export const SENTENCE_START_LOOKBACK_SECONDS = 6;

const STRONG_END = /[.!?]["'”)\]]*$/;

/** True when the segment closes a sentence, so the next one starts a new thought. */
export function endsSentence(text: string): boolean {
  return STRONG_END.test(text.trim());
}

/**
 * Index of the segment where the sentence containing `segments[index]` begins:
 * walks back while the previous segment does not close a sentence. Whisper
 * segments split long sentences, so snapping to a segment start alone can open
 * a short mid-thought ("...e por isso que eu falei"). Gives up (keeps `index`)
 * when the sentence start is further than the lookback window or unknown.
 */
export function sentenceStartIndex(
  segments: TranscriptSegment[],
  index: number,
  lookbackSeconds = SENTENCE_START_LOOKBACK_SECONDS,
): number {
  const limit = segments[index]!.start - lookbackSeconds;
  for (let i = index; i > 0; i--) {
    if (endsSentence(segments[i - 1]!.text)) return i;
    if (segments[i - 1]!.start < limit) return index;
  }
  return 0;
}
