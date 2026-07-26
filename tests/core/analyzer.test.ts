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

describe("analyzer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should process valid response from LLM successfully", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({
      clips: [{
        title: "Clip 1",
        description: "Desc",
        startTime: 10,
        endTime: 40,
        viralScore: 9,
        reason: "Reason",
        hashtags: ["#test"],
      }],
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Clip 1");
    expect(clips[0].duration).toBeCloseTo(30.6);
    const prompt = vi.mocked(gjModule.generateJsonObject).mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("Voc\u00ea \u00e9");
    expect(prompt).toContain("conte\u00fado");
    expect(prompt).not.toMatch(new RegExp("[\\u00f0\\u0178\\u00e2\\u20ac]"));
  });

  it("should sort clips by viralScore in descending order", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({
      clips: [
        {
          title: "Clip 1", description: "Desc", startTime: 10, endTime: 40,
          viralScore: 5, reason: "Reason", hashtags: ["#test"],
        },
        {
          title: "Clip 2", description: "Desc", startTime: 40, endTime: 70,
          viralScore: 9, reason: "Reason", hashtags: ["#test"],
        },
      ],
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(2);
    expect(clips[0].title).toBe("Clip 2");
    expect(clips[1].title).toBe("Clip 1");
  });

  it.each([
    { response: { clips: [] }, label: "empty clips list" },
    { response: {}, label: "missing clips array" },
  ])("returns empty for $label", async ({ response }) => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue(response as any);
    await expect(analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig))
      .resolves.toEqual([]);
  });
});
