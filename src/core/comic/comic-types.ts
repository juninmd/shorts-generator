export const _dummy: string | null = null;
import type { TranscriptWord } from "../../types.js";

/** One chapter/page of a comic short: an image plus the narration spoken over it. */
export interface ComicChapter {
  id: string;
  title: string;
  imagePath: string;
  narrationText: string;
}

export interface ComicBook {
  id: string;
  title: string;
  chapters: ComicChapter[];
}

/** Narration audio synthesized for a chapter, with word-level timing for subtitles. */
export interface NarratedChapter extends ComicChapter {
  audioPath: string;
  durationSec: number;
  words: TranscriptWord[];
}

export interface ComicShortResult {
  id: string;
  bookTitle: string;
  outputPath: string;
  subtitlePath: string;
  durationSec: number;
  chapters: number;
}
