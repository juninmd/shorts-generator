import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheEnabled, hashKey, readCache, writeCache } from "../../src/core/disk-cache.js";

describe("disk cache", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-"));
    process.env.ANALYSIS_CACHE = "true";
  });
  afterEach(() => { process.env.ANALYSIS_CACHE = "false"; });

  it("round-trips JSON and hashes values stably", () => {
    writeCache(dir, "k", { a: 1 });
    expect(readCache(dir, "k")).toEqual({ a: 1 });
    expect(hashKey({ a: 1 })).toBe(hashKey({ a: 1 }));
    expect(hashKey(undefined)).toHaveLength(20);
    expect(cacheEnabled()).toBe(true);
  });

  it("misses on absent, corrupt or expired entries", () => {
    expect(readCache(dir, "none")).toBeNull();
    fs.writeFileSync(path.join(dir, "bad.json"), "{");
    expect(readCache(dir, "bad")).toBeNull();
    writeCache(dir, "old", 1);
    const past = new Date(Date.now() - 10 * 86_400_000);
    fs.utimesSync(path.join(dir, "old.json"), past, past);
    expect(readCache(dir, "old")).toBeNull();
    expect(readCache(dir, "old", 30)).toBe(1);
  });

  it("does not write when disabled", () => {
    process.env.ANALYSIS_CACHE = "false";
    writeCache(dir, "off", 1);
    expect(fs.existsSync(path.join(dir, "off.json"))).toBe(false);
  });
});
