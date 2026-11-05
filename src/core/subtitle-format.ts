import type { TranscriptWord } from "../types.js";

export type SubtitleStyle = "karaoke" | "highlight";

/** SUBTITLE_STYLE=highlight keeps the legacy one-word-at-a-time highlight. */
export function resolveSubtitleStyle(): SubtitleStyle {
  return process.env.SUBTITLE_STYLE === "highlight" ? "highlight" : "karaoke";
}

export function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

export function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

/** A word that closes a sentence ("dinheiro.", "sério?!", "assim…"); captions never run past it. */
const SENTENCE_END = /[.!?…]["'”)\]]*$/;
/** A comma/semicolon/colon: the speaker's own breath point, as good as a short pause. */
const CLAUSE_END = /[,;:]["'”)\]]*$/;
/**
 * The bundled heavy font at 6.8% height fits ~13 characters per line in the
 * 980 px between the margins; a phrase may wrap to two lines, never three.
 */
export const MAX_PHRASE_CHARS = 26;

function phraseLength(phrase: TranscriptWord[], extra?: TranscriptWord): number {
  const words = extra ? [...phrase, extra] : phrase;
  return words.reduce((sum, w) => sum + w.word.trim().length, 0) + Math.max(0, words.length - 1);
}

/**
 * Splits words into caption phrases of ~targetSize words. A phrase ends at a
 * sentence end, a long pause, a comma/short pause once it is full, or before
 * a word that would push it past one caption line.
 */
export function groupWords(words: TranscriptWord[], targetSize = 4): TranscriptWord[][] {
  const phrases: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    current.push(word);
    const next = words[index + 1];
    const gap = next ? next.start - word.end : 0;
    const text = word.word.trim();
    const naturalPause = gap > 0.3 || CLAUSE_END.test(text);
    const hardPause = gap > 0.65 || SENTENCE_END.test(text);
    const overflows = next !== undefined && phraseLength(current, next) > MAX_PHRASE_CHARS;
    if (index === words.length - 1 || hardPause || overflows
      || (current.length >= targetSize && naturalPause)
      || current.length >= targetSize + 1) {
      phrases.push(current);
      current = [];
    }
  }
  const tail = phrases.at(-1);
  const previous = phrases.at(-2);
  if (tail && previous && tail.length < 3
    && !SENTENCE_END.test(previous.at(-1)!.word.trim())
    && tail[0]!.start - previous.at(-1)!.end <= 0.3) {
    const combined = [...previous, ...tail];
    const splitAt = Math.ceil(combined.length / 2);
    const halves = [combined.slice(0, splitAt), combined.slice(splitAt)];
    if (halves.every((half) => half.length < 2 || phraseLength(half) <= MAX_PHRASE_CHARS)) phrases.splice(-2, 2, ...halves);
  }
  return phrases;
}

/** "#RRGGBB" -> ASS style colour "&H00BBGGRR". */
export function assStyleColor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => hex.slice(i, i + 2).toUpperCase());
  return `&H00${b}${g}${r}`;
}

/** "#RRGGBB" -> ASS inline override colour "&HBBGGRR&". */
export function assInlineColor(hex: string): string {
  return `${assStyleColor(hex).replace("&H00", "&H")}&`;
}
