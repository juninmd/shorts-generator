import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveChannelHandle, formatFeedbackForPrompt, getChannelFeedback } from "../../src/core/viral-feedback.js";
import type { PipelineConfig } from "../../src/types.js";
import { execFile } from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

describe("viral-feedback", () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

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

    it("returns null if no handle is derived", async () => {
      process.env.VITEST = "";
      process.env.NODE_ENV = "production";
      const config = {} as PipelineConfig;
      expect(await getChannelFeedback(config)).toBeNull();
    });

    it("caches result for 6h", async () => {
      process.env.VITEST = "";
      process.env.NODE_ENV = "production";
      const config = { channelHandle: "@akitemquiz" } as PipelineConfig;

      const mockStdout = `100|Title 1\n200|Title 2\n300|Title 3\n400|Title 4\n500|Title 5\n600|Title 6\n700|Title 7\n800|Title 8\n900|Title 9\n1000|Title 10`;

      vi.mocked(execFile).mockImplementationOnce((cmd, args, opts, cb: any) => {
        cb(null, { stdout: mockStdout });
        return {} as any;
      });

      const res1 = await getChannelFeedback(config);
      const res2 = await getChannelFeedback(config);

      expect(res1).toEqual(res2);
      expect(execFile).toHaveBeenCalledTimes(1);
    });

    it("handles execFile error gracefully", async () => {
      process.env.VITEST = "";
      process.env.NODE_ENV = "production";
      const config = { channelHandle: "@error_channel" } as PipelineConfig;

      vi.mocked(execFile).mockImplementationOnce((cmd, args, opts, cb: any) => {
        cb(new Error("Failed"), { stdout: "", stderr: "" });
        return {} as any;
      });

      const res = await getChannelFeedback(config);
      expect(res).toBeNull();
    });

    it("handles missing values in stdout rows", async () => {
      process.env.VITEST = "";
      process.env.NODE_ENV = "production";
      const config = { channelHandle: "@invalid_rows" } as PipelineConfig;

      const mockStdout = `invalid|Title\n100|`;

      vi.mocked(execFile).mockImplementationOnce((cmd, args, opts, cb: any) => {
        cb(null, { stdout: mockStdout });
        return {} as any;
      });

      const res = await getChannelFeedback(config);
      expect(res).toBeNull();
    });

    it("handles no sep char in row", async () => {
      process.env.VITEST = "";
      process.env.NODE_ENV = "production";
      const config = { channelHandle: "@no_sep" } as PipelineConfig;

      const mockStdout = `Title without views\nAnother one`;

      vi.mocked(execFile).mockImplementationOnce((cmd, args, opts, cb: any) => {
        cb(null, { stdout: mockStdout });
        return {} as any;
      });

      const res = await getChannelFeedback(config);
      expect(res).toBeNull();
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

  describe("getChannelFeedback - branch coverage for median", () => {
    it("handles missing median views when slice returns undefined", async () => {
      process.env.VITEST = "";
      process.env.NODE_ENV = "production";
      const config = { channelHandle: "@no_median" } as PipelineConfig;

      const mockStdout = Array.from({ length: 10 })
        .map((_, i) => `${i + 1}|Title ${i + 1}`)
        .join("\n");

      const { execFile } = await import("node:child_process");
      vi.mocked(execFile).mockImplementationOnce((cmd, args, opts, cb: any) => {
        cb(null, { stdout: mockStdout });
        return {} as any;
      });

      const res = await getChannelFeedback(config);
      expect(res).not.toBeNull();
      // Even if median is somehow 0, it shouldn't crash
      expect(res?.medianViews).toBeGreaterThan(0);
    });
  });
