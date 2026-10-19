import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { buildAudioRouting, buildDuckingGraph, pickBackgroundMusic } from "../../src/core/audio-ducking.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, existsSync: vi.fn(), readdirSync: vi.fn() } };
});

describe("pickBackgroundMusic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BGM_FILE;
    delete process.env.BGM_DIR;
  });
  afterEach(() => {
    delete process.env.BGM_FILE;
    delete process.env.BGM_DIR;
  });

  it("is null when nothing is configured", () => {
    expect(pickBackgroundMusic()).toBeNull();
  });

  it("uses BGM_FILE when it exists, null when it does not", () => {
    process.env.BGM_FILE = "song.mp3";
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(pickBackgroundMusic()).toBe("song.mp3");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(pickBackgroundMusic()).toBeNull();
  });

  it("picks a random audio file from BGM_DIR, ignoring other files", () => {
    process.env.BGM_DIR = "music";
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["notes.txt", "a.MP3"] as any);
    expect(pickBackgroundMusic()).toMatch(/a\.MP3$/);
  });

  it("is null for a missing or empty BGM_DIR", () => {
    process.env.BGM_DIR = "music";
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(pickBackgroundMusic()).toBeNull();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["notes.txt"] as any);
    expect(pickBackgroundMusic()).toBeNull();
  });
});

describe("buildDuckingGraph", () => {
  afterEach(() => { delete process.env.BGM_VOLUME; });

  it("sidechain-compresses the music with the speech and mixes to [aout]", () => {
    const graph = buildDuckingGraph({ speechInput: "[0:a]", musicInput: "[1:a]", duration: 20 });
    expect(graph).toContain("[0:a]anull,aresample=44100,asplit=2[duck_sp][duck_sc]");
    expect(graph).toContain("[1:a]aresample=44100,volume=0.18,afade=t=in:d=1,afade=t=out:st=18.50:d=1.5[duck_bg]");
    expect(graph).toContain("[duck_bg][duck_sc]sidechaincompress=");
    expect(graph).toContain("amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]");
  });

  it("honors BGM_VOLUME, a speech filter and very short clips", () => {
    process.env.BGM_VOLUME = "0.3";
    const graph = buildDuckingGraph({ speechInput: "[0:a]", musicInput: "[2:a]", duration: 1, speechFilter: "highpass=f=70" });
    expect(graph).toContain("[0:a]highpass=f=70,aresample");
    expect(graph).toContain("volume=0.3,afade=t=in:d=1,afade=t=out:st=0.00");
  });
});

describe("buildAudioRouting", () => {
  it("keeps the speech-only chain when there is no music", () => {
    const routing = buildAudioRouting(10, null, 1);
    expect(routing.inputArgs).toEqual([]);
    expect(routing.graph).toBe("");
    expect(routing.outputArgs.slice(0, 3)).toEqual(["-map", "0:a?", "-af"]);
  });

  it("loops the music input and maps the ducked mix", () => {
    const routing = buildAudioRouting(10, "bgm.mp3", 2);
    expect(routing.inputArgs).toEqual(["-stream_loop", "-1", "-i", "bgm.mp3"]);
    expect(routing.graph).toContain("[2:a]aresample");
    expect(routing.graph).toContain("loudnorm");
    expect(routing.outputArgs).toEqual(["-map", "[aout]"]);
  });
});
