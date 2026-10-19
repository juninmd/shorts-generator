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

export function groupWords(words: TranscriptWord[], targetSize = 4): TranscriptWord[][] {
  const phrases: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    current.push(word);
    const next = words[index + 1];
    const gap = next ? next.start - word.end : 0;
    const naturalPause = gap > 0.3;
    const hardPause = gap > 0.65;
    if (index === words.length - 1 || hardPause
      || (current.length >= targetSize && naturalPause)
      || current.length >= targetSize + 1) {
      phrases.push(current);
      current = [];
    }
  }
  const tail = phrases.at(-1);
  const previous = phrases.at(-2);
  if (tail && previous && tail.length < 3
    && tail[0]!.start - previous.at(-1)!.end <= 0.3) {
    const combined = [...previous, ...tail];
    const splitAt = Math.ceil(combined.length / 2);
    phrases.splice(-2, 2, combined.slice(0, splitAt), combined.slice(splitAt));
  }
  return phrases;
}
