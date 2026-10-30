import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildBrollGraph, findLocalBroll, resolveBroll } from "../../src/core/broll.js";
import { fetchSceneFootage } from "../../src/core/faceless/stock-footage.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, existsSync: vi.fn(), readdirSync: vi.fn() } };
});
vi.mock("../../src/core/faceless/stock-footage.js", () => ({ fetchSceneFootage: vi.fn() }));
vi.mock("../../src/core/logger.js", () => ({ logger: { debug: vi.fn() } }));

const ENV = ["BROLL", "BROLL_DIR", "BROLL_SECONDS", "BROLL_MAX", "PEXELS_API_KEY"];

describe("findLocalBroll", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["city-night-drive.mp4", "night.MOV", "notes.txt", "ocean.mp4"] as any);
  });

  it("picks the video sharing the most words with the query", () => {
    expect(findLocalBroll("city night", "lib")).toMatch(/city-night-drive\.mp4$/);
    expect(findLocalBroll("ocean waves", "lib")).toMatch(/ocean\.mp4$/);
    expect(findLocalBroll("NIGHT", "lib")).toMatch(/\.(mp4|MOV)$/);
  });

  it("is null without overlap or without the folder", () => {
    expect(findLocalBroll("desert", "lib")).toBeNull();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(findLocalBroll("city", "lib")).toBeNull();
  });
});

describe("resolveBroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.forEach((name) => delete process.env[name]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["city-night.mp4"] as any);
  });
  afterEach(() => ENV.forEach((name) => delete process.env[name]));

  it("does nothing without cues or when disabled", async () => {
    expect(await resolveBroll(undefined, "w", "c")).toEqual([]);
    expect(await resolveBroll([], "w", "c")).toEqual([]);
    process.env.BROLL = "false";
    expect(await resolveBroll([{ at: 5, query: "x" }], "w", "c")).toEqual([]);
  });

  it("prefers the local library, then Pexels, skipping overlaps and respecting the cap", async () => {
    process.env.BROLL_DIR = "lib";
    process.env.BROLL_SECONDS = "2";
    process.env.BROLL_MAX = "2";
    process.env.PEXELS_API_KEY = "KEY";
    vi.mocked(fetchSceneFootage).mockResolvedValue("/w/c-broll2.mp4");
    const result = await resolveBroll([
      { at: 20, query: "mountain lake" },
      { at: 5, query: "city night" },
      { at: 6, query: "overlaps" },
      { at: 30, query: "over the cap" },
    ], "/w", "c");
    expect(result).toEqual([
      { at: 5, duration: 2, path: path.join("lib", "city-night.mp4") },
      { at: 20, duration: 2, path: "/w/c-broll2.mp4" },
    ]);
    expect(fetchSceneFootage).toHaveBeenCalledTimes(1);
    expect(fetchSceneFootage).toHaveBeenCalledWith(
      "mountain lake", path.join("/w", "c-broll2.mp4"), "KEY", expect.any(Set),
    );
  });

  it("drops cues with no footage and uses the default length and cap", async () => {
    vi.mocked(fetchSceneFootage).mockResolvedValue(null);
    expect(await resolveBroll([{ at: 5, query: "nothing" }], "/w", "c")).toEqual([]);
    vi.mocked(fetchSceneFootage).mockResolvedValue("/w/x.mp4");
    const result = await resolveBroll([{ at: 5, query: "a" }, { at: 15, query: "b" }, { at: 25, query: "c" }, { at: 35, query: "d" }], "/w", "c");
    expect(result).toHaveLength(3);
    expect(result[0]!.duration).toBe(2.6);
  });
});

describe("buildBrollGraph", () => {
  it("overlays each cutaway in its window, chaining labels to the output", () => {
    const graph = buildBrollGraph("[pre]", "[bro]", [
      { at: 4, duration: 2.5, path: "a.mp4" }, { at: 12, duration: 2.5, path: "b.mp4" },
    ], 3, 1080, 1920);
    expect(graph).toContain("[3:v]trim=duration=2.5,setpts=PTS-STARTPTS+4.000/TB,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[brv0]");
    expect(graph).toContain("[pre][brv0]overlay=enable='between(t\\,4.000\\,6.500)':eof_action=pass[bro0]");
    expect(graph).toContain("[bro0][brv1]overlay=enable='between(t\\,12.000\\,14.500)':eof_action=pass[bro]");
  });
});
