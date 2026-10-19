import { describe, expect, it } from "vitest";
import {
  buildFocusExpression, parseTrackerOutput, simplifyKeyframes,
} from "../../src/core/focus-keyframes.js";

const at = (t: number, x: number) => ({ t, x });

describe("simplifyKeyframes", () => {
  it("returns nothing for no samples", () => {
    expect(simplifyKeyframes([])).toEqual([]);
  });

  it("collapses a steady speaker to a single keyframe, ignoring jitter", () => {
    expect(simplifyKeyframes([at(0.25, 0.5), at(0.75, 0.52), at(1.25, 0.49)])).toEqual([at(0.25, 0.5)]);
  });

  it("median-filters a one-sample outlier and sorts unordered input", () => {
    const kept = simplifyKeyframes([at(1.25, 0.2), at(0.25, 0.2), at(0.75, 0.9), at(1.75, 0.2)]);
    expect(kept).toEqual([at(0.25, 0.2)]);
  });

  it("pans quickly on a speaker change by holding the old position first", () => {
    const kept = simplifyKeyframes([
      at(0.25, 0.2), at(0.75, 0.2), at(1.25, 0.2), at(1.75, 0.8), at(2.25, 0.8), at(2.75, 0.8),
    ]);
    expect(kept).toEqual([at(0.25, 0.2), at(1.45, 0.2), at(1.75, 0.8)]);
  });

  it("does not insert a hold when the jump follows too closely", () => {
    const kept = simplifyKeyframes([at(0, 0.2), at(0.1, 0.2), at(0.25, 0.8), at(0.4, 0.8)]);
    expect(kept).toEqual([at(0, 0.2), at(0.25, 0.8)]);
  });

  it("does not insert a hold for a small drift", () => {
    const kept = simplifyKeyframes([at(0, 0.3), at(2, 0.3), at(4, 0.38), at(6, 0.38)]);
    expect(kept).toEqual([at(0, 0.3), at(4, 0.38)]);
  });

  it("widens the dead zone until the keyframes fit the expression budget", () => {
    const wander = Array.from({ length: 60 }, (_, i) => at(i * 0.5, 0.4 + 0.05 * (i % 2 === 0 ? 1 : 2) * Math.sin(i / 4) + i * 0.002));
    const kept = simplifyKeyframes(wander);
    expect(kept.length).toBeLessThanOrEqual(16);
    expect(kept.length).toBeGreaterThan(0);
  });
});

describe("parseTrackerOutput", () => {
  it("parses and clamps [t, x] pairs", () => {
    expect(parseTrackerOutput("[[0.25, 0.4], [0.75, 1.7], [1.25, -2]]"))
      .toEqual([at(0.25, 0.4), at(0.75, 1), at(1.25, 0)]);
  });

  it("rejects non-array output", () => {
    expect(parseTrackerOutput('{"a":1}')).toEqual([]);
  });

  it("rejects malformed entries", () => {
    expect(parseTrackerOutput('[[0.25, "x"]]')).toEqual([]);
    expect(parseTrackerOutput("[5]")).toEqual([]);
  });
});

describe("buildFocusExpression", () => {
  it("is a constant for a single keyframe", () => {
    expect(buildFocusExpression([at(0.25, 0.4)])).toBe("0.4000");
  });

  it("holds before the first keyframe, interpolates between, holds after the last", () => {
    const expression = buildFocusExpression([at(1, 0.2), at(2, 0.8), at(4, 0.5)]);
    expect(expression).toBe(
      "if(lt(t\\,1.0000)\\,0.2000\\,if(lt(t\\,2.0000)\\,0.2000+(0.6000)*(t-1.0000)/1.0000"
      + "\\,if(lt(t\\,4.0000)\\,0.8000+(-0.3000)*(t-2.0000)/2.0000\\,0.5000)))",
    );
  });

  it("never divides by zero for duplicate timestamps", () => {
    expect(buildFocusExpression([at(1, 0.2), at(1, 0.8)])).toContain("/0.0010");
  });
});
