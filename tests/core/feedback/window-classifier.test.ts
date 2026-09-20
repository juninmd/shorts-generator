import { describe, it, expect } from "vitest";
import { byFormat, byFormatAndTheme, classifyWindow, MIN_SAMPLE, type MetricSnapshot } from "../../../src/core/feedback/window-classifier.js";

const snap = (id: string, ageHours: number, views: number, format = "cuts", theme: string | null = null): MetricSnapshot =>
  ({ youtubeVideoId: id, title: `T-${id}`, format, theme, ageHours, views });

const mature = (n: number, viewsFn: (i: number) => number = (i) => i * 10) =>
  Array.from({ length: n }, (_, i) => snap(`v${i}`, 24, viewsFn(i)));

describe("classifyWindow", () => {
  it("marks a group insufficient below MIN_SAMPLE", () => {
    const [group] = classifyWindow(mature(MIN_SAMPLE - 1), "24h", byFormat);
    expect(group).toMatchObject({ status: "insufficient_sample", medianViews: null, top: [], flop: [] });
  });

  it("ranks top/flop and computes the median once MIN_SAMPLE is reached", () => {
    const [group] = classifyWindow(mature(MIN_SAMPLE), "24h", byFormat);
    expect(group!.status).toBe("ok");
    expect(group!.sampleSize).toBe(MIN_SAMPLE);
    expect(group!.medianViews).not.toBeNull();
    expect(group!.top.length).toBeGreaterThan(0);
    expect(group!.flop.length).toBeGreaterThan(0);
  });

  it("counts a too-young video as immature, not a negative example", () => {
    const snapshots = [...mature(MIN_SAMPLE), snap("fresh", 1, 999)];
    const [group] = classifyWindow(snapshots, "24h", byFormat);
    expect(group!.immature).toBe(1);
    expect(group!.flop.some((v) => v.youtubeVideoId === "fresh")).toBe(false);
  });

  it("excludes a snapshot whose age has drifted past the window tolerance", () => {
    // 24h window tolerates up to 24 * 1.25 = 30h; 40h is stale (never in-window, never immature since maxAge >= hours).
    const snapshots = [...mature(MIN_SAMPLE), snap("stale", 40, 999)];
    const [group] = classifyWindow(snapshots, "24h", byFormat);
    expect(group!.sampleSize).toBe(MIN_SAMPLE);
    expect(group!.immature).toBe(0);
  });

  it("keeps the earliest in-window snapshot per video when several qualify", () => {
    const snapshots = [
      ...mature(MIN_SAMPLE - 1),
      snap("dup", 26, 100), // later snapshot inside window, seen first
      snap("dup", 25, 200), // earlier snapshot inside window, should win
    ];
    const [group] = classifyWindow(snapshots, "24h", byFormat);
    expect(group!.sampleSize).toBe(MIN_SAMPLE);
    const dup = [...group!.top, ...group!.flop].find((v) => v.youtubeVideoId === "dup");
    expect(dup?.views).toBe(200);
  });

  it("groups by format and theme separately", () => {
    const groups = classifyWindow([snap("a", 24, 10, "cuts", "faith"), snap("b", 24, 10, "cuts", "trivia")], "24h", byFormatAndTheme);
    expect(groups.map((g) => g.key).sort()).toEqual(["cuts|faith", "cuts|trivia"]);
  });

  it("carries avgViewPercentage through the ranked view when present", () => {
    const withPct = mature(MIN_SAMPLE).map((s, i) => (i === 0 ? { ...s, avgViewPercentage: 42 } : s));
    const [group] = classifyWindow(withPct, "24h", byFormat);
    const ranked = [...group!.top, ...group!.flop].find((v) => v.avgViewPercentage === 42);
    expect(ranked).toBeDefined();
  });
});
