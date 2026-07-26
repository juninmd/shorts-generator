import { describe, expect, it } from "vitest";
import { processClips } from "../../src/core/clip-processing.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

describe("clip processing", () => {
  it("keeps a short post-roll so the final spoken phrase is not clipped", () => {
    const transcript: Transcript = {
      videoId: "phrase-tail",
      duration: 20,
      language: "pt",
      fullText: "",
      segments: [
        { start: 0, end: 8, text: "A verdade liberta." },
        { start: 8, end: 15, text: "Ele fere para curar." },
      ],
      words: [
        { start: 13, end: 14.95, word: "curar." },
      ],
    };
    const clips = processClips([{
      title: "A verdade liberta",
      description: "Desc",
      startTime: 0,
      endTime: 15,
      viralScore: 9,
      reason: "Payoff completo",
      hashtags: [],
    }], transcript, {
      minShortDuration: 15,
      maxShortDuration: 59,
      minViralScore: 7,
    } as PipelineConfig, 1);

    expect(clips[0]).toMatchObject({ startTime: 0, endTime: 15.6, duration: 15.6 });
  });
});
