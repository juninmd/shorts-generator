import { describe, expect, it } from "vitest";
import { buildReplayHint, meanHeat, parseHeatmap, replayBonus } from "../../src/core/replay-heatmap.js";

const heat = [
  { start: 0, end: 10, value: 0.2 },
  { start: 10, end: 20, value: 1 },
  { start: 20, end: 30, value: 0.9 },
  { start: 30, end: 40, value: 0.2 },
  { start: 40, end: 50, value: 0.1 },
];

describe("replay heatmap", () => {
  it("parses yt-dlp segments and drops malformed ones", () => {
    expect(parseHeatmap(null)).toBeUndefined();
    expect(parseHeatmap([null, { start_time: 5, end_time: 1, value: 1 }])).toBeUndefined();
    expect(parseHeatmap([{ start_time: 0, end_time: 2, value: 0.5 }, { start_time: "x" }]))
      .toEqual([{ start: 0, end: 2, value: 0.5 }]);
  });

  it("weights mean heat by overlap", () => {
    expect(meanHeat(5, 15, heat)).toBeCloseTo(0.6);
    expect(meanHeat(100, 110, heat)).toBe(0);
  });

  it("rewards re-watched spans, capped at 0.5", () => {
    expect(replayBonus(10, 20, heat)).toBe(0.5);
    expect(replayBonus(20, 30, heat)).toBeCloseTo(0.44, 2);
    expect(replayBonus(40, 50, heat)).toBe(0);
    expect(replayBonus(0, 10, undefined)).toBe(0);
    expect(replayBonus(0, 10, [])).toBe(0);
    expect(replayBonus(0, 10, [{ start: 0, end: 10, value: 0 }])).toBe(0);
  });

  it("names merged hot stretches in the prompt", () => {
    expect(buildReplayHint(heat)).toContain("0:10-0:30");
    expect(buildReplayHint(undefined)).toBe("");
    expect(buildReplayHint([...heat, { start: 60, end: 70, value: 0.8 }], 2)).toMatch(/0:10-0:30, 1:00-1:10/);
    expect(buildReplayHint([{ start: 0, end: 10, value: 0.5 }])).toBe("");
  });
});
