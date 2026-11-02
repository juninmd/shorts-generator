import type { TranscriptWord } from "../types.js";

const REACTION = /^[[(]?(?:k{3,}|(?:ha|he|hi){2,}|rs+|risos?|risadas?|aplausos?|laughter|applause)[\])]?[.!?,]*$/i;
const MAX_CHAIN_GAP = 1;
const LOOKAHEAD_SECONDS = 1.5;

/** Laughter / applause tokens as transcribed ("kkkk", "haha", "[risos]"). */
export const isReaction = (word: string): boolean => REACTION.test(word.trim());

/**
 * End of the laugh or applause that answers a line ending at `from`, so the short does not
 * cut the joke off before its reaction. Undefined when there is none or it would exceed `limit`.
 */
export function reactionEnd(words: TranscriptWord[], from: number, limit: number): number | undefined {
  let end: number | undefined;
  let cursor = from;
  for (const word of words) {
    if (word.start < from - 0.05) continue;
    if (word.start - cursor > (end === undefined ? LOOKAHEAD_SECONDS : MAX_CHAIN_GAP)) break;
    if (!isReaction(word.word)) break;
    end = word.end;
    cursor = word.end;
  }
  return end !== undefined && end <= limit ? end : undefined;
}
