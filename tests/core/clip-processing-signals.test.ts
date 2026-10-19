import { describe, expect, it } from "vitest";
import { processClips } from "../../src/core/clip-processing.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

const transcript: Transcript = {
  videoId: "v", duration: 100, language: "pt", fullText: "",
  segments: [
    { start: 0, end: 20, text: "Primeiro trecho." },
    { start: 20, end: 40, text: "Segundo trecho." },
    { start: 40, end: 60, text: "Terceiro trecho." },
  ],
  words: [],
};
const config = { minShortDuration: 15, maxShortDuration: 59, minViralScore: 7 } as PipelineConfig;
const item = (over: object) => ({
  title: "T", description: "D", startTime: 0, endTime: 20, viralScore: 8, reason: "R", hashtags: [], ...over,
});

describe("processClips extras", () => {
  it("carries sub-scores and keywords and makes B-roll cues clip-relative", () => {
    const [clip] = processClips([item({
      title: "A", startTime: 20, endTime: 40,
      scoreBreakdown: { hook: 9, flow: 8, engagement: 7, trend: 6 },
      keywords: ["trecho"],
      broll: [{ at: 21, query: "too early" }, { at: 28, query: "city night" }, { at: 39, query: "too late" }],
    })], transcript, config, 1);
    expect(clip!.scoreBreakdown).toEqual({ hook: 9, flow: 8, engagement: 7, trend: 6 });
    expect(clip!.keywords).toEqual(["trecho"]);
    expect(clip!.broll).toEqual([{ at: 8, query: "city night" }]);
  });

  it("leaves broll undefined when no cue survives", () => {
    const [clip] = processClips([item({ broll: [{ at: 1, query: "x" }] })], transcript, config, 1);
    expect(clip!.broll).toBeUndefined();
  });

  it("breaks score ties in favour of the more energetic delivery", () => {
    const signals = { rmsPerSecond: [...Array(20).fill(-40), ...Array(20).fill(-15), ...Array(20).fill(-40)] };
    const clips = processClips([
      item({ title: "Calmo", startTime: 0, endTime: 20 }),
      item({ title: "Animado", startTime: 20, endTime: 40 }),
    ], transcript, config, 2, signals);
    expect(clips.map((c) => c.title)).toEqual(["Animado", "Calmo"]);
  });
});
