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

    it("should default ollamaTimeoutMs to 300000", () => {
      const config = loadConfig();
      expect(config.ollamaTimeoutMs).toBe(300_000);
    });

    it("should read OLLAMA_TIMEOUT_MS from environment", () => {
      process.env.OLLAMA_TIMEOUT_MS = "600000";
      const config = loadConfig();
      expect(config.ollamaTimeoutMs).toBe(600_000);
      delete process.env.OLLAMA_TIMEOUT_MS;
    });
  });

  describe("getMaxCuts", () => {
    it("should calculate max cuts based on minutes", () => {
      expect(getMaxCuts(60)).toBe(1); // 1 min -> 1
      expect(getMaxCuts(300)).toBe(5); // 5 min -> 5
      expect(getMaxCuts(30)).toBe(1); // 0.5 min -> max(1, 0) = 1
    });
  });

  describe("getMinCuts", () => {
    it("should calculate min cuts based on 2 per minute", () => {
      expect(getMinCuts(60)).toBe(2); // 1 min -> 2
      expect(getMinCuts(300)).toBe(10); // 5 min -> 10
      expect(getMinCuts(30)).toBe(2); // 0.5 min -> max(2, 0) = 2
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
