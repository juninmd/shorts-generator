import { describe, expect, it } from "vitest";
import { groupWords, MAX_PHRASE_CHARS } from "../../src/core/subtitle-format.js";
import type { TranscriptWord } from "../../src/types.js";

/** Back-to-back words, 0.3 s each, no pauses. */
function words(text: string): TranscriptWord[] {
  return text.split(" ").map((word, i) => ({ word, start: i * 0.3, end: i * 0.3 + 0.3 }));
}
const texts = (phrases: TranscriptWord[][]) => phrases.map((p) => p.map((w) => w.word).join(" "));

describe("groupWords punctuation and width", () => {
  it("never runs a phrase past a sentence end", () => {
    expect(texts(groupWords(words("Isso é sério. Então pensa nisso agora mesmo"))))
      .toEqual(["Isso é sério.", "Então pensa nisso", "agora mesmo"]);
  });

  it("does not merge a short tail back across a sentence end", () => {
    expect(texts(groupWords(words("Foi assim que eu fiz. Pronto")))).toEqual(["Foi assim que eu fiz.", "Pronto"]);
  });

  it("closes a full phrase at a comma", () => {
    expect(texts(groupWords(words("um dois três quatro, cinco seis sete oito"))))
      .toEqual(["um dois três quatro,", "cinco seis sete oito"]);
  });

  it("breaks before a word that would wrap to a third line", () => {
    const phrases = groupWords(words("responsabilidade financeira extraordinariamente importante"));
    expect(phrases.length).toBeGreaterThan(1);
    for (const phrase of phrases.filter((p) => p.length > 1)) {
      expect(phrase.map((w) => w.word).join(" ").length).toBeLessThanOrEqual(MAX_PHRASE_CHARS);
    }
  });

  it("keeps a single very long word as its own phrase", () => {
    expect(texts(groupWords(words("anticonstitucionalissimamente-falando sim")))).toEqual([
      "anticonstitucionalissimamente-falando", "sim",
    ]);
  });

  it("leaves a short tail alone when rebalancing would overflow a line", () => {
    expect(texts(groupWords(words("a b c dddddddddddddddddddd eeeeeeeeeeee")))).toEqual([
      "a b c dddddddddddddddddddd", "eeeeeeeeeeee",
    ]);
  });
});
