import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import * as gjModule from "../../src/core/generate-json.js";
import type { Transcript } from "../../src/types.js";
import { mockConfig } from "./analyzer-test-fixture.js";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));
vi.mock("../../src/core/clip-quality.js", () => ({
  reviewClipCandidates: vi.fn(async (clips) => clips),
}));

describe("analyzer chunking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("analyzes transcripts beyond the chunk threshold", async () => {
    const segments = Array.from({ length: 600 }, (_, index) => ({
      start: index * 2,
      end: index * 2 + 2,
      text: "A very long sentence here to fill up the chunk threshold limit quickly ".repeat(3),
    }));
    const transcript: Transcript = {
      videoId: "vid1",
      duration: 1200,
      segments,
      words: [],
      fullText: "",
      language: "pt",
    };
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({
      clips: [{
        title: "Clip Chunks", description: "Desc", startTime: 10, endTime: 40,
        viralScore: 9, reason: "Reason", hashtags: ["#test"],
      }],
    } as any);

    const clips = await analyzeTranscript(transcript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Clip Chunks");
  });
});
