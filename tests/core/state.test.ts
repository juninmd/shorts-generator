import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getDailyUploadCount,
  isDailyLimitReached,
  incrementDailyUploadCount,
  getDailyUploadCountAsync,
  isDailyLimitReachedAsync,
  incrementDailyUploadCountAsync,
  setDailyLimitReachedAsync,
  markVideoAsPostedAsync,
  getPostedTopVideosAsync,
} from "../../src/core/state.js";
import { logger } from "../../src/core/logger.js";
import { getOptionalPool, queryRows } from "../../src/core/control-plane-db.js";

vi.mock("node:fs");
vi.mock("../../src/core/logger.js", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockPool = {
  query: vi.fn().mockResolvedValue({ rows: [] }),
};

vi.mock("../../src/core/control-plane-db.js", () => ({
  getOptionalPool: vi.fn(() => null),
  queryRows: vi.fn().mockResolvedValue([]),
}));

describe("State management", () => {
  const DAILY_UPLOADS_PATH = path.resolve(process.cwd(), "daily_uploads.json");
  const todayISO = () => new Date().toISOString().slice(0, 10);

  beforeEach(() => vi.resetAllMocks());

  const setupFsMocks = (exists: boolean, readResult?: string | Error, writeResult?: Error) => {
    vi.mocked(fs.existsSync).mockReturnValue(exists);
    if (readResult instanceof Error) vi.mocked(fs.readFileSync).mockImplementation(() => { throw readResult; });
    else if (readResult !== undefined) vi.mocked(fs.readFileSync).mockReturnValue(readResult);

    if (writeResult) vi.mocked(fs.writeFileSync).mockImplementation(() => { throw writeResult; });
  };

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

  describe("Async state functions (DB path)", () => {

    beforeEach(() => {
      vi.mocked(getOptionalPool).mockReturnValue(mockPool);
      vi.mocked(queryRows).mockResolvedValue([]);
      mockPool.query.mockResolvedValue({ rows: [] });
    });

    afterEach(() => {
      vi.mocked(getOptionalPool).mockReturnValue(null);
    });

    it("getDailyUploadCountAsync returns 0 when no rows", async () => {
      vi.mocked(queryRows).mockResolvedValue([]);
      expect(await getDailyUploadCountAsync("global")).toBe(0);
    });

    it("getDailyUploadCountAsync returns count from DB row", async () => {
      vi.mocked(queryRows).mockResolvedValue([{ publish_count: 5 }] as any);
      expect(await getDailyUploadCountAsync("global")).toBe(5);
    });

    it("isDailyLimitReachedAsync returns true when at limit", async () => {
      vi.mocked(queryRows).mockResolvedValue([{ publish_count: 10 }] as any);
      expect(await isDailyLimitReachedAsync(10)).toBe(true);
    });

    it("isDailyLimitReachedAsync returns false when under limit", async () => {
      vi.mocked(queryRows).mockResolvedValue([{ publish_count: 3 }] as any);
      expect(await isDailyLimitReachedAsync(10)).toBe(false);
    });

    it("incrementDailyUploadCountAsync calls db.query", async () => {
      await incrementDailyUploadCountAsync("canal-1");
      expect(mockPool.query).toHaveBeenCalled();
    });

    it("setDailyLimitReachedAsync calls db.query", async () => {
      await setDailyLimitReachedAsync("canal-1");
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("daily_channel_quotas"), ["canal-1"]);
    });

    it("markVideoAsPostedAsync calls db.query", async () => {
      await markVideoAsPostedAsync("video-abc", "canal-1");
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT"), ["canal-1", "video-abc"]);
    });

    it("getPostedTopVideosAsync returns video ids from DB", async () => {
      vi.mocked(queryRows).mockResolvedValue([{ video_id: "vid-1" }, { video_id: "vid-2" }] as any);
      const result = await getPostedTopVideosAsync("canal-1");
      expect(result).toEqual(["vid-1", "vid-2"]);
      expect(queryRows).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining("channel_id = $1"), ["canal-1"]);
    });
  });

  describe("Async state functions (no-DB fallback)", () => {
    it("getDailyUploadCountAsync returns count from file when no DB", async () => {
      vi.mocked(getOptionalPool).mockReturnValue(null);
      // setupFsMocks to return a count from file
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const today = new Date().toISOString().slice(0, 10);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ date: today, count: 7 }));
      expect(await getDailyUploadCountAsync()).toBe(7);
    });
  });
});
