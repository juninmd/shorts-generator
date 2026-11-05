import { describe, expect, it } from "vitest";
import { isReaction, reactionEnd } from "../../src/core/reaction-tail.js";
import { cutRanges, planCuts } from "../../src/core/silence-cuts.js";
import { processClips } from "../../src/core/clip-processing.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe("reaction tail", () => {
  it("recognises transcribed laughter and applause", () => {
    for (const token of ["kkkk", "haha", "hahaha.", "[risos]", "(Aplausos)", "rs", "laughter"]) {
      expect(isReaction(token)).toBe(true);
    }
    for (const token of ["haver", "casa", "k"]) expect(isReaction(token)).toBe(false);
  });

  it("follows a chain of reaction words and stops at speech", () => {
    const words = [w("fim.", 9, 10), w("kkkk", 10.4, 11), w("haha", 11.5, 12.2), w("depois", 12.3, 12.8), w("rs", 20, 21)];
    expect(reactionEnd(words, 10, 59)).toBe(12.2);
    expect(reactionEnd(words, 10, 11.5)).toBeUndefined();
    expect(reactionEnd([w("kkkk", 14, 15)], 10, 59)).toBeUndefined();
    expect(reactionEnd([w("fala", 10, 11)], 10, 59)).toBeUndefined();
    expect(reactionEnd([w("antes", 1, 2), w("kkkk", 10.2, 11)], 10, 59)).toBe(11);
  });

  it("keeps the laugh inside the short", () => {
    const transcript: Transcript = {
      videoId: "v", duration: 40, language: "pt", fullText: "", segments: [{ start: 0, end: 20, text: "Piada." }],
      words: [w("piada.", 18, 19.5), w("kkkk", 19.8, 22)],
    };
    const [clip] = processClips([{
      title: "Piada", description: "", startTime: 0, endTime: 19.5, viralScore: 9, reason: "", hashtags: [],
    }], transcript, { minShortDuration: 15, maxShortDuration: 59, minViralScore: 7 } as PipelineConfig, 1);
    expect(clip!.endTime).toBeCloseTo(22.6);
  });
});

describe("protected pauses", () => {
  it("keeps the beat after a question and around a laugh, but still cuts filler there", () => {
    const question = [w("será?", 0.1, 0.6), w("sim", 1.8, 2.1), w("longo", 5, 5.4), w("fim", 8.5, 9)];
    expect(planCuts(question, 9.4)[0]!.end).toBeCloseTo(2.22);
    const laugh = [w("piada", 0.1, 0.6), w("kkkk", 1.8, 2.4), w("e", 3.9, 4.2)];
    expect(cutRanges({ words: laugh, duration: 4.5 })).toBeUndefined();
    const filler = [w("será?", 0.1, 0.6), w("eh", 0.8, 1.6), w("sim", 1.9, 2.3)];
    expect(planCuts(filler, 2.6).length).toBe(2);
  });
});
