import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPostedTopVideos,
  markVideoAsPosted,
  getDailyUploadCount,
  isDailyLimitReached,
  incrementDailyUploadCount
} from "../../src/core/state.js";
import { logger } from "../../src/core/logger.js";

vi.mock("../../src/core/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));

vi.mock("ioredis", () => {
  return {
    Redis: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      smembers: vi.fn(),
      sadd: vi.fn(),
      get: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    }))
  };
});

describe("State management (In-Memory Fallback)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getPostedTopVideos & markVideoAsPosted", () => {
    it("should start empty and add videos", async () => {
      const initial = await getPostedTopVideos();
      const initialLen = initial.length;
      
      await markVideoAsPosted("test_vid_1");
      const afterFirst = await getPostedTopVideos();
      expect(afterFirst.length).toBe(initialLen + 1);
      expect(afterFirst).toContain("test_vid_1");
      expect(logger.debug).toHaveBeenCalledWith({ videoId: "test_vid_1" }, "Marked video as posted in memory");
      
      await markVideoAsPosted("test_vid_2");
      const afterSecond = await getPostedTopVideos();
      expect(afterSecond.length).toBe(initialLen + 2);
      expect(afterSecond).toContain("test_vid_2");
    });
  });

  describe("Daily upload tracking", () => {
    it("should increment daily count and check limits", async () => {
      const initialCount = await getDailyUploadCount();
      
      await incrementDailyUploadCount();
      const newCount = await getDailyUploadCount();
      expect(newCount).toBe(initialCount + 1);
      
      expect(await isDailyLimitReached(newCount)).toBe(true);
      expect(await isDailyLimitReached(newCount + 1)).toBe(false);
    });
  });
});
