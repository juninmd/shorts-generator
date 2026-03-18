import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, getMaxCuts, getMinCuts, requiredEnv } from "../../src/core/config.js";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadConfig", () => {
    it("should load default values correctly", () => {
      process.env.YOUTUBE_CHANNELS = "channel1,channel2";
      const config = loadConfig();
      expect(config.channels).toEqual(["channel1", "channel2"]);
      expect(config.watermarkText).toBe("santidade católica");
      expect(config.outputDir).toContain("output");
      expect(config.tempDir).toContain("temp");
    });

    it("should allow overrides", () => {
      const config = loadConfig({ watermarkText: "custom watermark" });
      expect(config.watermarkText).toBe("custom watermark");
    });

    it("should default ollamaTimeoutMs to 400000", () => {
      const config = loadConfig();
      expect(config.ollamaTimeoutMs).toBe(400_000);
    });

    it("should read OLLAMA_TIMEOUT_MS from environment", () => {
      process.env.OLLAMA_TIMEOUT_MS = "600000";
      const config = loadConfig();
      expect(config.ollamaTimeoutMs).toBe(600_000);
      delete process.env.OLLAMA_TIMEOUT_MS;
    });
  });

  describe("getMaxCuts", () => {
    it("should calculate max cuts based on minutes ensuring max >= min", () => {
      expect(getMaxCuts(60)).toBe(2); // 1 min: min 2, max max(2, 1) = 2
      expect(getMaxCuts(300)).toBe(10); // 5 min: min 10, max max(10, 5) = 10
      expect(getMaxCuts(30)).toBe(2); // 0 min (rounded up to 1 for minCuts): min 2, max max(2, 0) = 2
    });
  });

  describe("getMinCuts", () => {
    it("should return at least 2 cuts per minute", () => {
      expect(getMinCuts(60)).toBe(2); // 1 min -> 2 cuts
      expect(getMinCuts(300)).toBe(10); // 5 min -> 10 cuts
      expect(getMinCuts(30)).toBe(2); // 0.5 min -> at least 1 min * 2 = 2 cuts
    });
  });

  describe("error handling", () => {
    it("should throw error if required env is missing", () => {
      delete process.env.TEST_REQUIRED_KEY;
      expect(() => requiredEnv("TEST_REQUIRED_KEY")).toThrow("Missing required environment variable: TEST_REQUIRED_KEY");
      expect(requiredEnv("TEST_REQUIRED_KEY", "fallback")).toBe("fallback");
    });
  });
});
