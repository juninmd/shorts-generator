import { describe, expect, it } from "vitest";
import { endAtSentence, findSentenceEnd, isSentenceEnd } from "../../src/core/sentence-end.js";
import type { ShortClip } from "../../src/types.js";

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe("isSentenceEnd", () => {
  it.each(["fim.", "mesmo?", "não!", "disse.”", "(sim).", "ok.\"", "Brasil!»"])("accepts %s", (word) => {
    expect(isSentenceEnd(word)).toBe(true);
  });

  it.each(["vamos,", "então", "...", "espera…", "Dr.", "\"Sr.", "etc.", "3,5", "fim;"])("rejects %s", (word) => {
    expect(isSentenceEnd(word)).toBe(false);
  });
});

describe("findSentenceEnd", () => {
  const words = [w("a.", 0, 10), w("b", 10.5, 12), w("c.", 12, 20), w("d", 21, 23), w("e!", 23, 30)];

  it("picks the sentence end closest to the target within the window", () => {
    expect(findSentenceEnd(words, 22, 5, 40)).toBe(20);
    expect(findSentenceEnd(words, 27, 5, 40)).toBe(30);
  });

  it("prefers the earlier sentence on a tie", () => {
    expect(findSentenceEnd([w("x.", 0, 10), w("y.", 11, 20)], 15, 5, 40)).toBe(10);
  });

  it("keeps the target when a sentence already ends within 0.3s of it", () => {
    expect(findSentenceEnd(words, 19.8, 5, 40)).toBe(19.8);
    expect(findSentenceEnd(words, 20.2, 5, 40)).toBe(20.2);
  });

  it("ignores sentence ends outside the allowed window and is undefined without any", () => {
    expect(findSentenceEnd(words, 22, 21, 25)).toBeUndefined();
    expect(findSentenceEnd([w("sem", 0, 5)], 5, 0, 10)).toBeUndefined();
  });
});

describe("endAtSentence", () => {
  const clip = {
    startTime: 100, endTime: 130, duration: 30,
    words: [w("Primeira", 0, 8), w("frase.", 8, 20), w("Segunda", 21, 27), w("começa", 27, 29), w("mas", 29, 30)],
    transcript: [{ start: 0, end: 20.5, text: "Primeira frase." }, { start: 21, end: 30, text: "Segunda começa mas" }],
  } as unknown as ShortClip;

  it("cuts back to the last full stop and leaves a short breath", () => {
    const result = endAtSentence(clip);
    expect(result.duration).toBeCloseTo(20.35);
    expect(result.endTime).toBeCloseTo(120.35);
    expect(result.words.map((x) => x.word)).toEqual(["Primeira", "frase."]);
    expect(result.transcript).toEqual([{ start: 0, end: 20.35, text: "Primeira frase." }]);
  });

  it("leaves a clip that already ends on a full stop alone", () => {
    const done = { ...clip, words: [...clip.words.slice(0, 4), w("fim.", 29, 30)] } as ShortClip;
    expect(endAtSentence(done)).toBe(done);
  });

  it("leaves clips without word timing, without punctuation or whose only full stop is too early", () => {
    const empty = { ...clip, words: [] } as ShortClip;
    expect(endAtSentence(empty)).toBe(empty);
    const bare = { ...clip, words: [w("sem", 0, 10), w("pontuação", 10, 30)] } as ShortClip;
    expect(endAtSentence(bare)).toBe(bare);
    const early = { ...clip, words: [w("curto.", 0, 3), w("resto", 3, 30)] } as ShortClip;
    expect(endAtSentence(early)).toBe(early);
  });

  it("never extends the clip past its own length", () => {
    const tight = { ...clip, duration: 12.2, words: [w("a", 0, 6), w("b.", 6, 12.1), w("c", 12.1, 12.2)] } as ShortClip;
    expect(endAtSentence(tight).duration).toBe(12.2);
  });
});
