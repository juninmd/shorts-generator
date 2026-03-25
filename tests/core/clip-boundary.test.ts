import { describe, it, expect } from "vitest";
import { snapToSentenceBoundaries } from "../../src/core/clip-boundary.js";
import type { PipelineConfig, TranscriptSegment } from "../../src/types.js";

const mockConfig: PipelineConfig = {
  minShortDuration: 5,
  maxShortDuration: 15,
} as PipelineConfig;

const mockSegments: TranscriptSegment[] = [
  { start: 0, end: 2, text: "Sentence 1." },
  { start: 2.5, end: 5, text: "Sentence 2." },
  { start: 6, end: 10, text: "Sentence 3." },
  { start: 11, end: 15, text: "Sentence 4." },
  { start: 16, end: 20, text: "Sentence 5." },
];

describe("clip-boundary", () => {
  it("should return original if no segments", () => {
    const clip = { startTime: 1, endTime: 5 };
    const result = snapToSentenceBoundaries(clip, [], mockConfig);
    expect(result).toEqual(clip);
  });

  it("should snap start and end to closest boundaries", () => {
    const clip = { startTime: 2.1, endTime: 9.8 };
    const result = snapToSentenceBoundaries(clip, mockSegments, mockConfig);
    expect(result.startTime).toBe(2.5); // Snapped to Sentence 2 start
    expect(result.endTime).toBe(10); // Snapped to Sentence 3 end
  });

  it("should snap mid-sentence start/end and expand to meet min duration", () => {
    // 6.5 is inside Sentence 3 (6-10) → start snaps to 6
    // 7.5 is inside Sentence 3 → end snaps to 10 (first seg.end >= 7.5)
    // duration = 4 < minDuration(5) → expand end to Sentence 4 (11-15)
    const clip = { startTime: 6.5, endTime: 7.5 };
    const result = snapToSentenceBoundaries(clip, mockSegments, mockConfig);
    expect(result.startTime).toBe(6);
    expect(result.endTime).toBe(15);
  });

  it("should expand to meet min duration (actual case)", () => {
    // We want finalStart < finalEnd and duration < 5
    // Let's use start=6, end=9.
    // findClosestSegmentStart(6) -> 6
    // findClosestSegmentEnd(9):
    // dist to 10 is 1. dist to 5 is 4. So end is 10.
    // Wait, duration is 10 - 6 = 4.
    const clip = { startTime: 6, endTime: 9 };
    const result = snapToSentenceBoundaries(clip, mockSegments, mockConfig);
    // Expand! Next segment is { start: 11, end: 15 }.
    expect(result.startTime).toBe(6);
    expect(result.endTime).toBe(15);
  });

  it("should shrink to meet max duration", () => {
    const clip = { startTime: 0, endTime: 18 }; // 18s > 15s max
    const result = snapToSentenceBoundaries(clip, mockSegments, mockConfig);
    // Start is 0. maxEnd is 15.
    // Snaps to last segment ending <= 15, which is Sentence 4 (ends at 15).
    expect(result.startTime).toBe(0);
    expect(result.endTime).toBe(15);
  });

  it("should return original if end <= start after snapping", () => {
    // endTime(1) snaps to seg1.end=2, startTime(4) is inside seg2(2.5-5) → snaps to 2.5
    // But 4 > 1 as input, so end=2 < start=2.5 → return original
    const clip = { startTime: 4, endTime: 1 };
    const result = snapToSentenceBoundaries(clip, mockSegments, mockConfig);
    expect(result.startTime).toBe(4);
    expect(result.endTime).toBe(1);
  });

  it("should return maxEnd if no valid segments found during shrink", () => {
    const customConfig = { ...mockConfig, maxShortDuration: 2 } as PipelineConfig;
    // clip startTime: 6
    // findClosestSegmentStart(6) -> 6
    // findClosestSegmentEnd(20) -> 20
    // start is 6, maxEnd is 8.
    // validSegments: start>=6 && end<=8.
    // Segments: {start:6, end:10}. None ends before 8.
    // So validSegments is empty. Should return maxEnd (8).
    // Wait, earlier the test passed but it didn't cover the line?
    // Let's create an explicit array of segments that guarantees shrink is called and validSegments is empty.
    const customSegments: TranscriptSegment[] = [
      { start: 1, end: 5, text: "Seg 1" },
      { start: 6, end: 15, text: "Seg 2" },
      { start: 16, end: 20, text: "Seg 3" },
    ];
    // Start at 6. Max short duration is 2. So maxEnd is 8.
    // We want end > start + maxDuration.
    // The closest end for 18 is 15. So finalEnd is 15.
    // duration = 15 - 6 = 9. 9 > maxDuration (2).
    // so shrinkToMeetMaxDuration(6, customSegments, 2) is called.
    // maxEnd = 8.
    // validSegments = {start >= 6 && end <= 8}. Seg 2 is 6-15, which doesn't end <= 8.
    // validSegments is empty. Returns maxEnd (8).
    const clip = { startTime: 6, endTime: 18 };
    const result = snapToSentenceBoundaries(clip, customSegments, customConfig);
    expect(result.startTime).toBe(6);
    expect(result.endTime).toBe(8);
  });

  it("should expand at the start if after expanding at the end it is still too short", () => {
    // We want to cover expanding at the start.
    const customConfig = { ...mockConfig, minShortDuration: 8, maxShortDuration: 20 } as PipelineConfig;
    const customSegments: TranscriptSegment[] = [
      { start: 1, end: 3, text: "Seg 1" }, // duration 2
      { start: 4, end: 6, text: "Seg 2" }, // duration 2
      { start: 7, end: 9, text: "Seg 3" }, // duration 2
    ];
    // clip: start 4.5, end 5.5
    // snapped to 4, 6. duration = 2.
    // minDuration = 8.
    // It tries to expand at the end. segsAfter: [7-9]. currentEnd becomes 9. duration: 9-4 = 5.
    // Still < 8.
    // It expands at the start. segsBefore: [1-3]. currentStart becomes 1. duration: 9-1 = 8.
    const clip = { startTime: 4.5, endTime: 5.5 };
    const result = snapToSentenceBoundaries(clip, customSegments, customConfig);
    expect(result.startTime).toBe(1);
    expect(result.endTime).toBe(9);
  });
});
