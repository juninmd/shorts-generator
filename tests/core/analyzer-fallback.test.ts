import { beforeEach, describe, expect, it, vi } from "vitest";
import * as aiModule from "ai";
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

describe("analyzer fallback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty when both generation paths fail", async () => {
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(new Error("AI Error"));
    vi.mocked(aiModule.generateText).mockRejectedValue(new Error("AI Fallback Error"));
    await expect(analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig))
      .resolves.toEqual([]);
  });

  it("handles AbortError when the fallback also fails", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(abortError);
    vi.mocked(aiModule.generateText).mockRejectedValue(new Error("AI Fallback Error"));
    await expect(analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig))
      .resolves.toEqual([]);
  });

  it("returns empty when fallback text has no JSON", async () => {
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(new Error("main failed"));
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: "no json here at all" } as any);
    await expect(analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig))
      .resolves.toEqual([]);
  });

  it("parses JSON from fallback text", async () => {
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(new Error("main failed"));
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: JSON.stringify({
        clips: [{
          title: "FB Clip", description: "D", startTime: 10, endTime: 40,
          viralScore: 8, reason: "R", hashtags: [],
        }],
      }),
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("FB Clip");
  });

  it("parses a markdown-fenced top-level fallback array", async () => {
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(new Error("main failed"));
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: "```json\n[{\"title\":\"Arr Clip\",\"description\":\"D\",\"startTime\":10,\"endTime\":40,\"viralScore\":7,\"reason\":\"R\",\"hashtags\":[]}]\n```",
    } as any);

    const clips = await analyzeTranscript(mockTranscript, "Title", "Channel", mockConfig);

    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("Arr Clip");
  });
});
