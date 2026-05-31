import { describe, it, expect, vi } from "vitest";
import {
  formatTime,
  formatTranscriptForLLM,
  splitIntoChunks,
  deduplicateClips,
  analyzeInChunks,
  type ClipItem,
} from "../../src/core/analyzer-chunks.js";
import type { Transcript, TranscriptSegment, PipelineConfig } from "../../src/types.js";

describe("analyzer-chunks", () => {
  it("formatTime formats seconds directly as float string", () => {
    expect(formatTime(0)).toBe("0.00");
    expect(formatTime(59)).toBe("59.00");
    expect(formatTime(61)).toBe("61.00");
    expect(formatTime(3600)).toBe("3600.00");
    expect(formatTime(65.5)).toBe("65.50");
  });

  it("formatTranscriptForLLM formats segments correctly", () => {
    const segments = [
      { start: 1, end: 5, text: "Hello" },
      { start: 6, end: 10, text: "World" },
    ] as TranscriptSegment[];
    expect(formatTranscriptForLLM(segments)).toBe("[1.00-5.00] Hello\n[6.00-10.00] World");
  });

  it("splitIntoChunks processes empty segments", () => {
    const chunks = splitIntoChunks([], 30, 1);
    expect(chunks).toHaveLength(0);
  });

  it("splitIntoChunks splits correctly and overlaps", () => {
    const segments = [
      { start: 1, end: 2, text: "A".repeat(10) },
      { start: 2, end: 3, text: "B".repeat(10) },
      { start: 3, end: 4, text: "C".repeat(10) },
      { start: 4, end: 5, text: "D".repeat(10) },
    ] as TranscriptSegment[];

    // Each formatted line is around 25 chars: "[00:01-00:02] AAAAAAAAAA\n" (25)
    // Threshold = 30 means it should split after 1 segment.
    const chunks = splitIntoChunks(segments, 30, 1);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeGreaterThan(0);
  });

  it("deduplicateClips removes overlapping clips keeping highest viralScore", () => {
    const clips: ClipItem[] = [
      { title: "A", startTime: 10, endTime: 20, viralScore: 8, reason: "1", description: "D", hashtags: [] },
      { title: "B", startTime: 15, endTime: 25, viralScore: 9, reason: "2", description: "D", hashtags: [] }, // overlaps A, higher score
      { title: "C", startTime: 30, endTime: 40, viralScore: 7, reason: "3", description: "D", hashtags: [] }, // no overlap
    ];

    const kept = deduplicateClips(clips);
    expect(kept).toHaveLength(2);
    expect(kept.map(c => c.title)).toContain("B");
    expect(kept.map(c => c.title)).toContain("C");
    expect(kept.map(c => c.title)).not.toContain("A");
  });

  it("analyzeInChunks processes multiple chunks and deduplicates", async () => {
    const transcript: Transcript = {
      videoId: "vid1",
      language: "en",
      duration: 100,
      fullText: "",
      words: [],
      segments: [
        { start: 1, end: 2, text: "Hello" },
        { start: 2, end: 3, text: "World" },
      ]
    };

    const config = {} as PipelineConfig;

    const analyzeSinglePass = vi.fn().mockResolvedValue([
      { title: "Mock", startTime: 1, endTime: 2, viralScore: 10, reason: "", description: "", hashtags: [] }
    ]);

    const result = await analyzeInChunks(transcript, "Title", "Channel", config, 1, 2, analyzeSinglePass);

    expect(analyzeSinglePass).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Mock");
  });
});