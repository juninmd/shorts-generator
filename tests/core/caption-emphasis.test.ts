import { describe, expect, it } from "vitest";
import { EMOJI_BY_WORD, phraseEmoji, pickEmphasis } from "../../src/core/caption-emphasis.js";

const w = (word: string, i = 0) => ({ word, start: i, end: i + 0.3 });

describe("pickEmphasis", () => {
  it("picks LLM keywords (accent/case/punctuation-insensitive), numbers and power words", () => {
    const words = ["O", "Segredo", "de", "100", "mineiros,", "quatro", "Médicos.", "...", "talvez"].map(w);
    const picked = pickEmphasis(words, ["médicos", "mineiros"]);
    expect([...picked].map((x) => x.word)).toEqual(["Segredo", "100", "mineiros,", "quatro", "Médicos."]);
  });

  it("supports multi-word keywords and works without any", () => {
    const words = [w("nada"), w("trapped"), w("miners")];
    expect([...pickEmphasis(words, ["trapped miners"])].map((x) => x.word)).toEqual(["trapped", "miners"]);
    expect(pickEmphasis(words).size).toBe(0);
  });
});

describe("phraseEmoji", () => {
  it("returns the emoji of the first emphasised word that has one", () => {
    const phrase = [w("o"), w("dinheiro"), w("fogo")];
    expect(phraseEmoji(phrase, new Set([phrase[1]!, phrase[2]!]))).toBe(EMOJI_BY_WORD.dinheiro);
  });

  it("ignores words that are not emphasised or have no emoji", () => {
    const phrase = [w("dinheiro"), w("casa")];
    expect(phraseEmoji(phrase, new Set())).toBe("");
    expect(phraseEmoji(phrase, new Set([phrase[1]!]))).toBe("");
  });
});
