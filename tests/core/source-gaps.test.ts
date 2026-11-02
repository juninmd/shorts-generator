import { describe, expect, it } from "vitest";
import { findUnproposedGaps, overlapSeconds } from "../../src/core/source-gaps.js";

describe("source gaps", () => {
  it("lists uncovered stretches of at least 30s, in time order", () => {
    const gaps = findUnproposedGaps(300, [
      { startTime: 50, endTime: 90 },
      { startTime: 60, endTime: 100 },
      { startTime: 110, endTime: 200 },
    ]);
    expect(gaps).toEqual([
      { startTime: 0, endTime: 50 },
      { startTime: 200, endTime: 300 },
    ]);
  });

  it("caps the list and keeps the longest gaps", () => {
    const proposed = Array.from({ length: 5 }, (_, i) => ({ startTime: 40 + i * 100, endTime: 50 + i * 100 }));
    expect(findUnproposedGaps(600, proposed, 30, 2)).toHaveLength(2);
  });

  it("measures overlap between two intervals", () => {
    expect(overlapSeconds({ startTime: 0, endTime: 10 }, { startTime: 6, endTime: 20 })).toBe(4);
    expect(overlapSeconds({ startTime: 0, endTime: 5 }, { startTime: 6, endTime: 20 })).toBe(0);
  });
});
