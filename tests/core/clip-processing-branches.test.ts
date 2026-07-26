import { describe, expect, it } from "vitest";
import { processClips } from "../../src/core/clip-processing.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

describe("clip processing branches", () => {
  it("deduplicates normalized titles and keeps the strongest clip", () => {
    const transcript = {
      videoId: "dedupe",
      duration: 60,
      language: "pt",
      fullText: "",
      words: [],
      segments: [
        { start: 0, end: 20, text: "A verdade liberta." },
        { start: 20, end: 40, text: "A verdade liberta." },
      ],
    } as Transcript;
    const base = { description: "D", reason: "R", hashtags: [] };
    const result = processClips([
      { ...base, title: "A Verdade!", startTime: 0, endTime: 20, viralScore: 9 },
      { ...base, title: "a verdade", startTime: 20, endTime: 40, viralScore: 8 },
    ], transcript, {
      minShortDuration: 15,
      maxShortDuration: 59,
      minViralScore: 7,
    } as PipelineConfig, 2);

    expect(result).toHaveLength(1);
    expect(result[0]?.viralScore).toBe(9);
  });
});
