import type { TranscriptWord } from "../types.js";

const normalize = (word: string): string =>
  word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}%$]/gu, "");

const NUMBER_WORDS = new Set([
  "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "cem", "mil", "milhao", "milhoes", "bilhao",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "hundred", "thousand", "million", "billion",
]);

const POWER_WORDS = new Set([
  "nunca", "sempre", "segredo", "verdade", "erro", "dinheiro", "perigo", "gratis", "urgente", "proibido", "milagre",
  "never", "always", "secret", "truth", "mistake", "money", "danger", "free", "urgent", "banned", "miracle",
]);

/** Emoji shown next to an emphasised word (opt-in: CAPTION_EMOJI=true). */
export const EMOJI_BY_WORD: Record<string, string> = {
  dinheiro: "💰", money: "💰", milhao: "💰", million: "💰", fogo: "🔥", fire: "🔥",
  amor: "❤️", love: "❤️", deus: "🙏", god: "🙏", jesus: "🙏", oracao: "🙏",
  perigo: "⚠️", danger: "⚠️", erro: "❌", mistake: "❌", verdade: "✅", truth: "✅",
  segredo: "🤫", secret: "🤫", morte: "💀", death: "💀", rir: "😂", funny: "😂",
  ideia: "💡", idea: "💡", tempo: "⏰", time: "⏰", sucesso: "🏆", success: "🏆",
  nasa: "🚀", space: "🚀", espaco: "🚀", mineiros: "⛏️", miners: "⛏️", saude: "🩺", health: "🩺",
};

/** Words to emphasise: the LLM's keywords, plus numbers and power words. */
export function pickEmphasis(words: TranscriptWord[], keywords: string[] = []): Set<TranscriptWord> {
  const wanted = new Set(keywords.flatMap((keyword) => keyword.split(/\s+/)).map(normalize).filter(Boolean));
  return new Set(words.filter((word) => {
    const key = normalize(word.word);
    return key !== "" && (wanted.has(key) || /\d/.test(key) || NUMBER_WORDS.has(key) || POWER_WORDS.has(key));
  }));
}

/** First emoji available for the phrase's emphasised words, or "". */
export function phraseEmoji(phrase: TranscriptWord[], emphasis: Set<TranscriptWord>): string {
  return phrase.map((word) => (emphasis.has(word) ? EMOJI_BY_WORD[normalize(word.word)] : undefined))
    .find((emoji) => emoji !== undefined) ?? "";
}
