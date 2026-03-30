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
  logger: { debug: vi.fn(), error: vi.fn() }
}));

describe("State management", () => {
  const STATE_FILE_PATH = path.resolve(process.cwd(), "posted_top_videos.json");
  const DAILY_UPLOADS_PATH = path.resolve(process.cwd(), "daily_uploads.json");
  const todayISO = () => new Date().toISOString().slice(0, 10);

  beforeEach(() => vi.resetAllMocks());

  const setupFsMocks = (exists: boolean, readResult?: string | Error, writeResult?: Error) => {
    vi.mocked(fs.existsSync).mockReturnValue(exists);
    if (readResult instanceof Error) vi.mocked(fs.readFileSync).mockImplementation(() => { throw readResult; });
    else if (readResult !== undefined) vi.mocked(fs.readFileSync).mockReturnValue(readResult);

    if (writeResult) vi.mocked(fs.writeFileSync).mockImplementation(() => { throw writeResult; });
  };

  describe("getPostedTopVideos", () => {
    it.each([
      ["file exists", true, '["vid1", "vid2"]', ["vid1", "vid2"]],
      ["file does not exist", false, undefined, []],
    ])("should return parsed array if %s", (_, exists, readRes, expected) => {
      setupFsMocks(exists as boolean, readRes as string);
      expect(getPostedTopVideos()).toEqual(expected);
    });

    it("should return empty array and log error on read failure", () => {
      setupFsMocks(true, new Error("Read error"));
      expect(getPostedTopVideos()).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error) }), "Failed to read posted top videos state");
    });
  });

  describe("markVideoAsPosted", () => {
    it("should append videoId and save to state file", () => {
      setupFsMocks(true, '["vid1"]');
      markVideoAsPosted("vid2");
      expect(fs.writeFileSync).toHaveBeenCalledWith(STATE_FILE_PATH, JSON.stringify(["vid1", "vid2"], null, 2));
      expect(logger.debug).toHaveBeenCalledWith({ videoId: "vid2" }, "Marked video as posted in state file");
    });

    it("should log error on write failure", () => {
      setupFsMocks(true, '["vid1"]', new Error("Write error"));
      markVideoAsPosted("vid2");
      expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error) }), "Failed to save posted top videos state");
    });
  });

  describe("Daily upload tracking", () => {
    describe("getDailyUploadCount & isDailyLimitReached", () => {
      it.each([
        ["file exists and date matches", true, { date: todayISO(), count: 5 }, 5, 4, true],
        ["file exists and date matches not limit", true, { date: todayISO(), count: 1 }, 1, 3, false],
        ["file date does not match", true, { date: "2000-01-01", count: 5 }, 0, 3, false],
        ["file does not exist", false, undefined, 0, 3, false],
      ])("should return count %s", (_, exists, readObj, expectedCount, limit, expectedLimit) => {
        setupFsMocks(exists as boolean, readObj ? JSON.stringify(readObj) : undefined);
        expect(getDailyUploadCount()).toBe(expectedCount);
        expect(isDailyLimitReached(limit as number)).toBe(expectedLimit);
      });

      it("should return 0 if reading fails", () => {
        setupFsMocks(true, new Error("parse error"));
        expect(getDailyUploadCount()).toBe(0);
      });
    });

    describe("incrementDailyUploadCount", () => {
      it("should increment count and save file", () => {
        setupFsMocks(true, JSON.stringify({ date: todayISO(), count: 2 }));
        incrementDailyUploadCount();
        expect(fs.writeFileSync).toHaveBeenCalledWith(DAILY_UPLOADS_PATH, JSON.stringify({ date: todayISO(), count: 3 }, null, 2));
      });

      it("should start from 0 if no matching date state", () => {
        setupFsMocks(false);
        incrementDailyUploadCount();
        expect(fs.writeFileSync).toHaveBeenCalledWith(DAILY_UPLOADS_PATH, JSON.stringify({ date: todayISO(), count: 1 }, null, 2));
      });

      it("should log error on write failure", () => {
        setupFsMocks(true, JSON.stringify({ date: todayISO(), count: 2 }), new Error("Write error"));
        incrementDailyUploadCount();
        expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error) }), "Failed to update daily upload count");
      });
    });
  });
});
