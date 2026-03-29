import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getPostedTopVideos,
  markVideoAsPosted,
  getDailyUploadCount,
  isDailyLimitReached,
  incrementDailyUploadCount
} from "../../src/core/state.js";
import { logger } from "../../src/core/logger.js";

vi.mock("node:fs");
vi.mock("../../src/core/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
  }
}));

describe("State management", () => {
  const STATE_FILE_PATH = path.resolve(process.cwd(), "posted_top_videos.json");
  const DAILY_UPLOADS_PATH = path.resolve(process.cwd(), "daily_uploads.json");

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("getPostedTopVideos", () => {
    it("should return parsed array if state file exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('["vid1", "vid2"]');

      const result = getPostedTopVideos();
      expect(result).toEqual(["vid1", "vid2"]);
      expect(fs.readFileSync).toHaveBeenCalledWith(STATE_FILE_PATH, "utf-8");
    });

    it("should return empty array if file does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = getPostedTopVideos();
      expect(result).toEqual([]);
    });

    it("should return empty array and log error on read failure", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error("Read error"); });

      const result = getPostedTopVideos();
      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        "Failed to read posted top videos state"
      );
    });
  });

  describe("markVideoAsPosted", () => {
    it("should append videoId and save to state file", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('["vid1"]');

      markVideoAsPosted("vid2");

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        STATE_FILE_PATH,
        JSON.stringify(["vid1", "vid2"], null, 2)
      );
      expect(logger.debug).toHaveBeenCalledWith(
        { videoId: "vid2" },
        "Marked video as posted in state file"
      );
    });

    it("should log error on write failure", () => {
      vi.mocked(fs.writeFileSync).mockImplementation(() => { throw new Error("Write error"); });

      markVideoAsPosted("vid2");

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        "Failed to save posted top videos state"
      );
    });
  });

  describe("Daily upload tracking", () => {
    const todayISO = () => new Date().toISOString().slice(0, 10);

    describe("getDailyUploadCount", () => {
      it("should return count if file exists and date matches", () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ date: todayISO(), count: 5 }));

        expect(getDailyUploadCount()).toBe(5);
      });

      it("should return 0 if file date does not match", () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ date: "2000-01-01", count: 5 }));

        expect(getDailyUploadCount()).toBe(0);
      });

      it("should return 0 if file does not exist", () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        expect(getDailyUploadCount()).toBe(0);
      });

      it("should return 0 if reading fails", () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error("parse error"); });

        expect(getDailyUploadCount()).toBe(0);
      });
    });

    describe("isDailyLimitReached", () => {
      it("should return true if limit is reached", () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ date: todayISO(), count: 3 }));

        expect(isDailyLimitReached(3)).toBe(true);
        expect(isDailyLimitReached(2)).toBe(true);
      });

      it("should return false if limit is not reached", () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ date: todayISO(), count: 1 }));

        expect(isDailyLimitReached(3)).toBe(false);
      });
    });

    describe("incrementDailyUploadCount", () => {
      it("should increment count and save file", () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ date: todayISO(), count: 2 }));

        incrementDailyUploadCount();

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          DAILY_UPLOADS_PATH,
          JSON.stringify({ date: todayISO(), count: 3 }, null, 2)
        );
        expect(logger.debug).toHaveBeenCalledWith(
          { date: todayISO(), count: 3 },
          "Daily YouTube upload count updated"
        );
      });

      it("should start from 0 if no matching date state", () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        incrementDailyUploadCount();

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          DAILY_UPLOADS_PATH,
          JSON.stringify({ date: todayISO(), count: 1 }, null, 2)
        );
      });

      it("should log error on write failure", () => {
        vi.mocked(fs.writeFileSync).mockImplementation(() => { throw new Error("Write error"); });

        incrementDailyUploadCount();

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          "Failed to update daily upload count"
        );
      });
    });
  });
});
