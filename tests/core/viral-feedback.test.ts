import { describe, it, expect } from "vitest";
import { resolveChannelHandle, formatFeedbackForPrompt, getChannelFeedback } from "../../src/core/viral-feedback.js";
import type { PipelineConfig } from "../../src/types.js";

describe("viral-feedback", () => {
  describe("resolveChannelHandle", () => {
    it("prefers explicit channelHandle and normalizes the @ prefix", () => {
      expect(resolveChannelHandle({ channelHandle: "@akitemquiz" } as PipelineConfig)).toBe("@akitemquiz");
      expect(resolveChannelHandle({ channelHandle: "akitemquiz" } as PipelineConfig)).toBe("@akitemquiz");
    });

    it("derives the handle from a slug-like managed channel id", () => {
      const config = { managedRun: { channelId: "santidade-catolica" } } as PipelineConfig;
      expect(resolveChannelHandle(config)).toBe("@santidade-catolica");
    });

    it("returns null when no handle can be derived", () => {
      expect(resolveChannelHandle({} as PipelineConfig)).toBeNull();
      expect(resolveChannelHandle({ managedRun: { channelId: "id with spaces" } } as PipelineConfig)).toBeNull();
    });
  });

  describe("getChannelFeedback", () => {
    it("returns null under test environment (never spawns yt-dlp)", async () => {
      const config = { channelHandle: "@akitemquiz" } as PipelineConfig;
      expect(await getChannelFeedback(config)).toBeNull();
    });
  });

  describe("formatFeedbackForPrompt", () => {
    it("returns empty string without feedback", () => {
      expect(formatFeedbackForPrompt(null)).toBe("");
      expect(formatFeedbackForPrompt({ topTitles: [], flopTitles: [], medianViews: 0 })).toBe("");
    });

    it("renders top and flop titles as prompt guidance", () => {
      const block = formatFeedbackForPrompt({
        topTitles: ["Capital de Angola (4497 views)"],
        flopTitles: ["Quiz: ciência!"],
        medianViews: 12,
      });
      expect(block).toContain("MAIS performaram");
      expect(block).toContain("Capital de Angola (4497 views)");
      expect(block).toContain("FRACASSARAM");
      expect(block).toContain("Quiz: ciência!");
    });
  });
});
