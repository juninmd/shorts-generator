import { describe, expect, it } from "vitest";
import { dedupeCandidates, resolveOverlaps, similarity } from "../../src/core/clip-overlap.js";

const clip = (title: string, startTime: number, endTime: number, viralScore = 8, hookText?: string) =>
  ({ title, description: "", startTime, endTime, viralScore, reason: "", hashtags: [], hookText });

describe("clip overlap", () => {
  it("scores word overlap and tolerates empty text", () => {
    expect(similarity("a verdade liberta sempre", "a verdade liberta sempre")).toBe(1);
    expect(similarity("a", "b")).toBe(0);
  });

  it("keeps boundary alternatives but drops repeats of one moment", () => {
    const kept = dedupeCandidates([
      clip("a", 0, 40, 7), clip("b", 0, 38, 9), clip("c", 30, 70, 8),
    ]);
    expect(kept.map((item) => item.title)).toEqual(["b", "c"]);
  });

  it("allows 5s of shared footage and drops larger overlaps or repeated hooks", () => {
    const kept = resolveOverlaps([
      clip("a", 0, 40, 9, "a verdade liberta sempre"),
      clip("b", 35, 70, 8, "outra coisa totalmente diferente aqui"),
      clip("c", 30, 60, 7, "mais um assunto bem distinto agora"),
      clip("d", 100, 130, 6, "a verdade liberta sempre"),
      clip("e", 140, 170, 5),
    ]);
    expect(kept.map((item) => item.title)).toEqual(["a", "b", "e"]);
  });
});
