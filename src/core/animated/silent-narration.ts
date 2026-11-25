import type { ComicChapter, NarratedChapter } from "../comic/comic-types.js";

const SECONDS_PER_WORD = 0.42;
const MIN_CHAPTER_SEC = 2;

/**
 * Timing-only chapter for runs without a voice: words are spaced evenly so captions still sync.
 * `audioPath` is empty; the stick renderer then writes a silent track of `durationSec`.
 */
export function silentNarration(chapter: ComicChapter): NarratedChapter {
  const tokens = chapter.narrationText.split(/\s+/).filter(Boolean);
  const durationSec = Math.max(MIN_CHAPTER_SEC, tokens.length * SECONDS_PER_WORD);
  const step = durationSec / Math.max(1, tokens.length);
  const words = tokens.map((word, i) => ({ word, start: i * step, end: (i + 1) * step }));
  return { ...chapter, audioPath: "", durationSec, words };
}
