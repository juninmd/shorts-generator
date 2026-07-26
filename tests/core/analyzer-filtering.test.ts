import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import * as gjModule from "../../src/core/generate-json.js";
import { mockConfig, mockTranscript } from "./analyzer-test-fixture.js";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));
vi.mock("../../src/core/clip-quality.js", () => ({
  reviewClipCandidates: vi.fn(async (clips) => clips),
}));

describe("analyzer filtering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters invalid duration and timestamps", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({
      clips: [
        {
          title: "Too Short", description: "Desc", startTime: 10, endTime: 15,
          viralScore: 9, reason: "Reason", hashtags: ["#test"],
        },
        {
          title: "Too Long", description: "Desc", startTime: 10, endTime: 90,
          viralScore: 9, reason: "Reason", hashtags: ["#test"],
        },
        {
          title: "Invalid Times", description: "Desc", startTime: -10, endTime: 130,
          viralScore: 9, reason: "Reason", hashtags: ["#test"],
        },
        {
          title: "Valid", description: "Desc", startTime: 40, endTime: 70,
          viralScore: 8, reason: "Reason", hashtags: ["#test"],
        },
      ],
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Valid");
  });

  it("correctly handles words within the clip range", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({
      clips: [{
        title: "Clip Words", description: "Desc", startTime: 10, endTime: 40,
        viralScore: 8, reason: "Reason", hashtags: ["#test"],
      }],
    } as any);
    const transcriptWithWords = {
      ...mockTranscript,
      words: [
        { word: "Inside", start: 9.9, end: 12 },
        { word: "Normal", start: 12, end: 14 },
      ],
    };

    const clips = await analyzeTranscript(transcriptWithWords, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].words).toHaveLength(2);
    expect(clips[0].words[0].start).toBe(0);
  });
});
