import { describe, expect, it, afterEach } from "vitest";
import { nextPeakSlot, peakHours } from "../../src/core/publish-schedule.js";

describe("peakHours", () => {
  afterEach(() => { delete process.env.PEAK_HOURS; });

  it("defaults to 12, 18 and 21", () => {
    expect(peakHours()).toEqual([12, 18, 21]);
  });

  it("parses, sorts, de-duplicates and drops invalid hours", () => {
    process.env.PEAK_HOURS = "21, 9,abc,25,9,-1";
    expect(peakHours()).toEqual([9, 21]);
    process.env.PEAK_HOURS = "xx";
    expect(peakHours()).toEqual([12, 18, 21]);
  });

  it("rejects partially numeric tokens instead of truncating them", () => {
    process.env.PEAK_HOURS = "18abc,12.5,7,1e1";
    expect(peakHours()).toEqual([7]);
  });
});

describe("nextPeakSlot", () => {
  afterEach(() => { delete process.env.PEAK_HOURS; delete process.env.PUBLISH_TZ; });
  const now = new Date("2026-10-19T18:30:00Z"); // 15:30 in São Paulo (UTC-3)

  it("walks the upcoming peaks in the configured time zone", () => {
    const slots = [0, 1, 2, 3].map((index) => nextPeakSlot(now, index).toISOString());
    expect(slots).toEqual([
      "2026-10-19T21:00:00.000Z", // 18:00 BRT
      "2026-10-20T00:00:00.000Z", // 21:00 BRT
      "2026-10-20T15:00:00.000Z", // 12:00 BRT next day
      "2026-10-20T21:00:00.000Z",
    ]);
  });

  it("falls back to America/Sao_Paulo when PUBLISH_TZ is not a valid zone", () => {
    process.env.PUBLISH_TZ = "Brasil/Sao_Paulo";
    expect(nextPeakSlot(now).toISOString()).toBe("2026-10-19T21:00:00.000Z");
  });

  it("requires a 10 minute lead", () => {
    const almost = new Date("2026-10-19T20:55:00Z"); // 17:55 BRT, 5 min before 18:00
    expect(nextPeakSlot(almost).toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it("follows daylight saving in the zone and PEAK_HOURS", () => {
    process.env.PEAK_HOURS = "12";
    process.env.PUBLISH_TZ = "America/New_York";
    // 00:00 EST on the night DST starts; noon local is already EDT (UTC-4)
    expect(nextPeakSlot(new Date("2026-03-08T05:00:00Z")).toISOString()).toBe("2026-03-08T16:00:00.000Z");
  });
});
