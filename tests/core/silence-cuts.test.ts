import { describe, expect, it, afterEach } from "vitest";
import {
  cutRanges, planCuts, remapClip, remapKeyframes, remapTime, totalDuration,
} from "../../src/core/silence-cuts.js";
import type { ShortClip } from "../../src/types.js";

const w = (word: string, start: number, end: number) => ({ word, start, end });
const close = (ranges: { start: number; end: number }[]) => ranges.map((r) => [Number(r.start.toFixed(2)), Number(r.end.toFixed(2))]);

describe("planCuts", () => {
  it("keeps everything when pauses are short", () => {
    const words = [w("a", 0.15, 0.5), w("b", 0.6, 1.0), w("c", 1.1, 1.5)];
    expect(planCuts(words, 1.9)).toEqual([{ start: 0, end: 1.9 }]);
  });

  it("cuts long pauses leaving a breath on both sides", () => {
    const words = [w("a", 0.1, 0.5), w("b", 1.5, 2.0), w("c", 2.05, 2.4)];
    expect(close(planCuts(words, 2.7))).toEqual([[0, 0.62], [1.38, 2.7]]);
  });

  it("trims leading and trailing dead air", () => {
    const words = [w("a", 2.0, 2.5), w("b", 2.6, 3.0)];
    expect(close(planCuts(words, 6))).toEqual([[1.85, 3.35]]);
  });

  it("removes filler words even when the gap is small", () => {
    const words = [w("então", 0.1, 0.5), w("eh", 0.52, 0.9), w("vamos", 0.92, 1.3), w("hmm", 1.32, 1.8), w("ir", 1.82, 2.2)];
    const ranges = planCuts(words, 2.4);
    expect(close(ranges)).toEqual([[0, 0.53], [0.89, 1.33], [1.79, 2.4]]);
  });

  it("keeps a filler when the gap around it is too tight to cut", () => {
    const words = [w("a", 0.1, 0.5), w("eh", 0.52, 0.56), w("b", 0.58, 1.0), w("c", 1.05, 1.9), w("d", 2.9, 3.3)];
    const ranges = planCuts(words, 3.5);
    expect(ranges).toHaveLength(2);
  });

  it("ignores a clip made only of fillers", () => {
    expect(planCuts([w("eh", 0, 1)], 3)).toEqual([{ start: 0, end: 3 }]);
  });

  it("does not bother cutting when it would save under half a second", () => {
    const words = [w("a", 0.1, 0.5), w("b", 1.2, 1.6)];
    expect(planCuts(words, 2)).toEqual([{ start: 0, end: 2 }]);
  });

  it("caps the number of cuts at the 40 biggest", () => {
    const words = Array.from({ length: 60 }, (_, i) => w(`w${i}`, 0.1 + i * 1.0, 0.4 + i * 1.0));
    const ranges = planCuts(words, 61);
    expect(ranges.length).toBeLessThanOrEqual(41);
    expect(ranges.length).toBeGreaterThan(30);
  });
});

describe("time remapping", () => {
  const ranges = [{ start: 0, end: 2 }, { start: 5, end: 8 }];

  it("maps kept time, snaps removed time to the cut and clamps past the end", () => {
    expect(remapTime(1, ranges)).toBe(1);
    expect(remapTime(3.5, ranges)).toBe(2);
    expect(remapTime(6, ranges)).toBe(3);
    expect(remapTime(9, ranges)).toBe(5);
    expect(remapTime(1, [{ start: 2, end: 3 }])).toBe(0);
  });

  it("totals the edited duration", () => {
    expect(totalDuration(ranges)).toBe(5);
  });

  it("keeps one keyframe per instant on the edited timeline", () => {
    const frames = remapKeyframes([{ t: 1, x: 0.2 }, { t: 3, x: 0.3 }, { t: 4, x: 0.4 }, { t: 6, x: 0.9 }], ranges);
    expect(frames).toEqual([{ t: 1, x: 0.2 }, { t: 2, x: 0.4 }, { t: 3, x: 0.9 }]);
  });
});

describe("remapClip", () => {
  const clip = {
    id: "c", duration: 8, words: [w("a", 0, 1), w("eh", 1, 1.5), w("b", 5.2, 6), w("lost", 3, 3.5)],
    transcript: [{ start: 0, end: 7, text: "t" }],
    broll: [{ at: 6, query: "q" }],
  } as unknown as ShortClip;

  it("drops fillers and words in removed stretches, shifting the rest", () => {
    const edited = remapClip(clip, [{ start: 0, end: 2 }, { start: 5, end: 8 }]);
    expect(edited.words.map((x) => [x.word, x.start, x.end])).toEqual([["a", 0, 1], ["b", 2.2, 3]]);
    expect(edited.transcript[0]).toEqual({ start: 0, end: 4, text: "t" });
    expect(edited.broll).toEqual([{ at: 3, query: "q" }]);
    expect(edited.duration).toBe(5);
  });

  it("works without B-roll cues", () => {
    const edited = remapClip({ ...clip, broll: undefined }, [{ start: 0, end: 8 }]);
    expect(edited.broll).toBeUndefined();
  });
});

describe("cutRanges", () => {
  afterEach(() => { delete process.env.SILENCE_CUT; });
  const words = [w("a", 0.1, 0.5), w("b", 1.5, 2.0), w("c", 2.05, 2.4)];

  it("is the cut plan when there is something to cut", () => {
    expect(cutRanges({ words, duration: 2.7 })).toHaveLength(2);
  });

  it("is undefined when disabled, without words or with nothing to cut", () => {
    process.env.SILENCE_CUT = "false";
    expect(cutRanges({ words, duration: 2.7 })).toBeUndefined();
    delete process.env.SILENCE_CUT;
    expect(cutRanges({ words: [], duration: 3 })).toBeUndefined();
    expect(cutRanges({ words: [w("a", 0.15, 1), w("b", 1.1, 2)], duration: 2.4 })).toBeUndefined();
  });

  it("is a single trimmed range when only the edges are cut", () => {
    const ranges = cutRanges({ words: [w("a", 2.0, 2.5), w("b", 2.6, 3.0)], duration: 6 });
    expect(ranges).toHaveLength(1);
    expect(ranges![0]!.start).toBeGreaterThan(0);
  });
});
