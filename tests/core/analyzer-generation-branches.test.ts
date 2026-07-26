import { beforeEach, describe, expect, it, vi } from "vitest";
import * as aiModule from "ai";
import { analyzeSinglePass } from "../../src/core/analyzer-generation.js";
import * as gjModule from "../../src/core/generate-json.js";
import type { PipelineConfig } from "../../src/types.js";

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn(() => ({ id: "mock" })),
}));
vi.mock("../../src/core/viral-feedback.js", () => ({
  getChannelFeedback: vi.fn(async () => []),
  formatFeedbackForPrompt: vi.fn(() => ""),
}));

const config = {
  minShortDuration: 15,
  maxShortDuration: 59,
  aiTimeoutMs: 1000,
} as PipelineConfig;

describe("analyzer generation fallback branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(new Error("fallback"));
  });

  it("rejects malformed JSON envelopes", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: "[" } as never);
    await expect(analyzeSinglePass("texto", "t", "c", config, 1, 2))
      .resolves.toEqual([]);
  });

  it("filters primitives and normalizes start/end aliases", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: '[null,"x",{"title":"A","start":10,"end":30}]',
    } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([expect.objectContaining({ startTime: 10, endTime: 30 })]);
  });

  it("accepts one top-level object and preserves explicit timestamps", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: '{"title":"A","startTime":4,"endTime":24}',
    } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result).toEqual([expect.objectContaining({ startTime: 4, endTime: 24 })]);
  });

  it("defaults missing fallback timestamps to zero", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: '{"clips":[{"title":"A"}]}',
    } as never);
    const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
    expect(result[0]).toMatchObject({ startTime: 0, endTime: 0 });
  });
});
