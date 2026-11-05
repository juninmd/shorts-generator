import { describe, expect, it } from "vitest";
import { resolveAnchors } from "../../src/core/clip-anchors.js";

const segments = [
  { start: 0, end: 10, text: "Introdução longa." },
  { start: 10, end: 20, text: "A verdade vai doer, né?" },
  { start: 20, end: 30, text: "Ela liberta. Ele fere para curar." },
];
const clip = {
  title: "T", description: "D", startTime: 12, endTime: 25, viralScore: 8, reason: "R", hashtags: [],
  hookText: "A verdade vai doer, né?", payoffText: "Ele fere para curar.",
};

describe("clip anchors", () => {
  it("resolves quotes to real rows and widens the cut to hold both anchors", () => {
    expect(resolveAnchors(clip, segments)).toMatchObject({
      hookSegment: 1, payoffSegment: 2, startTime: 10, endTime: 30,
    });
  });

  it("discards quotes that match no row inside the interval", () => {
    const resolved = resolveAnchors({ ...clip, hookText: "Frase inventada", payoffText: " " }, segments);
    expect(resolved).toMatchObject({ hookText: undefined, payoffText: undefined, startTime: 12, endTime: 25 });
  });

  it("discards both anchors when the payoff comes before the hook", () => {
    const resolved = resolveAnchors(
      { ...clip, hookText: "Ela liberta. Ele fere para curar.", payoffText: "A verdade vai doer, né?", startTime: 10, endTime: 30 },
      segments,
    );
    expect(resolved.hookSegment).toBeUndefined();
    expect(resolved.payoffSegment).toBeUndefined();
  });

  it("leaves clips without quotes untouched", () => {
    expect(resolveAnchors({ ...clip, hookText: undefined, payoffText: undefined }, segments))
      .toMatchObject({ startTime: 12, endTime: 25 });
  });
});
