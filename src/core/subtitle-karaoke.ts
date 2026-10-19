import type { TranscriptWord } from "../types.js";
import type { BrandTemplate } from "./brand-template.js";
import { phraseEmoji } from "./caption-emphasis.js";
import { assInlineColor, escapeAssText, formatASSTime, groupWords } from "./subtitle-format.js";

export interface KaraokeOptions {
  brand: BrandTemplate;
  emphasis: Set<TranscriptWord>;
}

const POP_UP_MS = 120;
const POP_SETTLE_MS = 140;

/** Per-word overrides: emphasised words get the keyword colour, a bigger size and a pop; the word after resets. */
function wordTags(
  word: TranscriptWord,
  offsetMs: number,
  previousEmphasised: boolean,
  options: KaraokeOptions,
): string {
  if (options.emphasis.has(word)) {
    const pop = options.brand.pop
      ? `\\t(${offsetMs},${offsetMs + POP_UP_MS},\\fscx128\\fscy128)\\t(${offsetMs + POP_UP_MS},${offsetMs + POP_UP_MS + POP_SETTLE_MS},\\fscx115\\fscy115)`
      : "";
    return `\\1c${assInlineColor(options.brand.keywordColor)}\\fscx115\\fscy115${pop}`;
  }
  return previousEmphasised ? `\\1c${assInlineColor(options.brand.highlightColor)}\\fscx100\\fscy100` : "";
}

/**
 * One event per phrase with `\kf` tags: libass sweeps each word from the
 * style's SecondaryColour to its PrimaryColour exactly as it is spoken. Each
 * word's sweep lasts until the next word starts, so pauses never drift the sync.
 * With options, keywords get their own colour, size and pop, and an emoji can
 * trail the phrase.
 */
export function karaokeEvents(words: TranscriptWord[], options?: KaraokeOptions): string {
  return groupWords(words).map((phrase) => {
    let previousEmphasised = false;
    const text = phrase.map((word, index) => {
      const until = phrase[index + 1]?.start ?? word.end;
      const centiseconds = Math.max(1, Math.round((until - word.start) * 100));
      const extra = options
        ? wordTags(word, Math.round((word.start - phrase[0]!.start) * 1000), previousEmphasised, options)
        : "";
      previousEmphasised = options?.emphasis.has(word) ?? false;
      return `{\\kf${centiseconds}${extra}}${escapeAssText(word.word)}`;
    }).join(" ");
    const emoji = options?.brand.emoji ? phraseEmoji(phrase, options.emphasis) : "";
    const start = formatASSTime(phrase[0]!.start);
    const end = formatASSTime(phrase.at(-1)!.end);
    return `Dialogue: 0,${start},${end},Karaoke,,0,0,0,,{\\fad(60,40)}${text}${emoji ? ` ${emoji}` : ""}`;
  }).join("\n");
}
