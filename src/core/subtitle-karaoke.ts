import type { TranscriptWord } from "../types.js";
import { escapeAssText, formatASSTime, groupWords } from "./subtitle-format.js";

/**
 * One event per phrase with `\kf` tags: libass sweeps each word from the
 * style's SecondaryColour to its PrimaryColour exactly as it is spoken. Each
 * word's sweep lasts until the next word starts, so pauses never drift the sync.
 */
export function karaokeEvents(words: TranscriptWord[]): string {
  return groupWords(words).map((phrase) => {
    const text = phrase.map((word, index) => {
      const until = phrase[index + 1]?.start ?? word.end;
      const centiseconds = Math.max(1, Math.round((until - word.start) * 100));
      return `{\\kf${centiseconds}}${escapeAssText(word.word)}`;
    }).join(" ");
    const start = formatASSTime(phrase[0]!.start);
    const end = formatASSTime(phrase.at(-1)!.end);
    return `Dialogue: 0,${start},${end},Karaoke,,0,0,0,,{\\fad(60,40)}${text}`;
  }).join("\n");
}
