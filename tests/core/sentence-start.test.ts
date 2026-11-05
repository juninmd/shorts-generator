import { describe, expect, it } from "vitest";
import { endsSentence, sentenceStartIndex } from "../../src/core/sentence-start.js";
import { snapToSentenceBoundaries } from "../../src/core/clip-boundary.js";
import type { PipelineConfig, TranscriptSegment } from "../../src/types.js";

const seg = (start: number, end: number, text: string): TranscriptSegment => ({ start, end, text });

describe("sentence start", () => {
  it("recognises sentence-closing punctuation, quotes included", () => {
    expect(endsSentence("foi isso.")).toBe(true);
    expect(endsSentence('ele disse "chega!" ')).toBe(true);
    expect(endsSentence("e aí,")).toBe(false);
  });

  it("walks back to the segment after the previous full stop", () => {
    const segments = [seg(0, 3, "Primeira ideia."), seg(3, 6, "Então o que"), seg(6, 9, "eu fiz foi isso.")];
    expect(sentenceStartIndex(segments, 2)).toBe(1);
  });

  it("reaches the start of the transcript", () => {
    expect(sentenceStartIndex([seg(0, 3, "sem ponto"), seg(3, 6, "continua")], 1)).toBe(0);
  });

  it("keeps the segment when the sentence began beyond the lookback", () => {
    const segments = [seg(0, 2, "Fim."), seg(2, 10, "um trecho enorme"), seg(10, 12, "que segue")];
    expect(sentenceStartIndex(segments, 2)).toBe(2);
  });

  it("opens a clip on the sentence start instead of a mid-thought split", () => {
    const config = { minShortDuration: 5, maxShortDuration: 30 } as PipelineConfig;
    const segments = [seg(0, 4, "Introdução."), seg(4, 7, "O segredo que ninguém"), seg(7, 12, "te conta é esse."), seg(12, 20, "Fim.")];
    expect(snapToSentenceBoundaries({ startTime: 8, endTime: 19 }, segments, config).startTime).toBe(4);
  });

  it("still expands backwards at the end of the transcript to reach the minimum length", () => {
    const config = { minShortDuration: 10, maxShortDuration: 30 } as PipelineConfig;
    const segments = [seg(0, 4, "A."), seg(4, 8, "B."), seg(8, 10, "C.")];
    expect(snapToSentenceBoundaries({ startTime: 8.5, endTime: 9.5 }, segments, config)).toEqual({ startTime: 0, endTime: 10 });
  });
});
