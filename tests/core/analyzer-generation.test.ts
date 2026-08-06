import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeSinglePass } from "../../src/core/analyzer-generation.js";
import * as aiModule from "ai";
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
vi.mock("../../src/core/abort-timeout.js", () => ({
  scheduleAbort: vi.fn(() => 123 as any),
}));

const config = {
  minShortDuration: 15,
  maxShortDuration: 59,
  aiTimeoutMs: 1000,
} as PipelineConfig;

describe("analyzer generation default paths", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns clips object properly from generateJsonObject", async () => {
        vi.mocked(gjModule.generateJsonObject).mockResolvedValueOnce({ clips: [{ startTime: 1, endTime: 2, title: "test" }] } as never);
        const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
        expect(result).toEqual([{ startTime: 1, endTime: 2, title: "test" }]);
    });

    it("returns empty array when clips object is undefined from generateJsonObject", async () => {
        vi.mocked(gjModule.generateJsonObject).mockResolvedValueOnce({} as never);
        const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
        expect(result).toEqual([]);
    });

    it("falls back to text generation successfully", async () => {
        vi.mocked(gjModule.generateJsonObject).mockRejectedValueOnce(new Error("err"));
        vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: '{"clips": [{"startTime": 1, "endTime": 2, "title": "test2"}]}' } as never);

        const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
        expect(result).toEqual([{ startTime: 1, endTime: 2, title: "test2" }]);
    });

    it("handles explicit start / end mappings in fallback", async () => {
        vi.mocked(gjModule.generateJsonObject).mockRejectedValueOnce(new Error("err"));
        vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: '[{"start": 1, "end": 2, "title": "test2"}]' } as never);

        const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
        expect(result).toEqual([expect.objectContaining({ startTime: 1, endTime: 2, title: "test2" })]);
    });

    it("handles explicit startTime / endTime mappings in fallback arrays", async () => {
        vi.mocked(gjModule.generateJsonObject).mockRejectedValueOnce(new Error("err"));
        vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: '[{"startTime": 1, "endTime": 2, "title": "test2"}]' } as never);

        const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
        expect(result).toEqual([expect.objectContaining({ startTime: 1, endTime: 2, title: "test2" })]);
    });

    it("handles explicit start / end mappings in fallback object clips array", async () => {
        vi.mocked(gjModule.generateJsonObject).mockRejectedValueOnce(new Error("err"));
        vi.mocked(aiModule.generateText).mockResolvedValueOnce({ text: '{"clips": [{"start": 1, "end": 2, "title": "test2"}]}' } as never);

        const result = await analyzeSinglePass("texto", "t", "c", config, 1, 2);
        expect(result).toEqual([expect.objectContaining({ startTime: 1, endTime: 2, title: "test2" })]);
    });
});
