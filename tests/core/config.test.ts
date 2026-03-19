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
      expect(config.videoLimit).toBe(3);
      expect(config.outputDir).toContain("output");
      expect(config.tempDir).toContain("temp");
    });

    it("should allow overrides", () => {
      const config = loadConfig({ watermarkText: "custom watermark", videoLimit: 10 });
      expect(config.watermarkText).toBe("custom watermark");
      expect(config.videoLimit).toBe(10);
    });

    it("should read OLLAMA_TIMEOUT_MS from environment", () => {
      process.env.OLLAMA_TIMEOUT_MS = "600000";
      const config = loadConfig();
      expect(config.ollamaTimeoutMs).toBe(600_000);
    });
  });

  describe("getMaxCuts", () => {
    it("should calculate max cuts based on minutes ensuring max >= min", () => {
      // 1 min (60s): min is 2, max is min+1 = 3
      expect(getMaxCuts(60)).toBe(3); 
      // 5 min (300s): min is 2, max is 2
      // wait, let's check the logic: 
      // durationMinutes = 5. minCuts = min(5, max(2, floor(5/5))) = min(5, max(2, 1)) = 2.
      // maxCuts = min(15, max(2+1, floor(5/2))) = min(15, max(3, 2)) = 3.
      expect(getMaxCuts(300)).toBe(3);
      // 30s: min is 2, max is 3
      expect(getMaxCuts(30)).toBe(3);
    });
  });

  describe("getMinCuts", () => {
    it("should return at least 2 cuts", () => {
      expect(getMinCuts(60)).toBe(2); // 1 min -> 2 cuts
      expect(getMinCuts(300)).toBe(2); // 5 min -> 2 cuts
      expect(getMinCuts(1500)).toBe(5); // 25 min -> 5 cuts (max)
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
