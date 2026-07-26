import { describe, expect, it } from "vitest";
import {
  discoverTextualCandidates,
  scoreTextualImpact,
} from "../../src/core/candidate-discovery.js";
import type { Transcript } from "../../src/types.js";

const transcript = (texts: string[]): Transcript => ({
  videoId: "branches",
  duration: texts.length * 10,
  language: "pt",
  fullText: texts.join(" "),
  words: [],
  segments: texts.map((text, index) => ({
    start: index * 10,
    end: (index + 1) * 10,
    text,
  })),
});

describe("candidate discovery branches", () => {
  it("scores question and exclamation rhetoric", () => {
    expect(scoreTextualImpact("Será que a verdade liberta?!")).toBeGreaterThanOrEqual(7);
  });

  it("uses a non-punctuated fallback ending", () => {
    const result = discoverTextualCandidates(
      transcript(["A verdade liberta", "O segredo cura"]),
      10,
      20,
      2,
    );
    expect(result[0]?.endTime).toBe(20);
  });

  it("skips overlapping windows", () => {
    const result = discoverTextualCandidates(
      transcript(["A verdade liberta.", "O segredo cura.", "Nada comum."]),
      10,
      30,
      3,
    );
    expect(result).toHaveLength(2);
  });

  it("stops when the requested limit is reached", () => {
    const result = discoverTextualCandidates(
      transcript(["A verdade liberta.", "O segredo cura."]),
      10,
      20,
      1,
    );
    expect(result).toHaveLength(1);
  });
});
