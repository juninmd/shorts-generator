import { describe, expect, it, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import {
  buildEnergyHint, computeAudioSignals, energyBonus, parseRmsLevels,
} from "../../src/core/audio-signals.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../../src/core/ffmpeg-bin.js", () => ({ ffmpegBin: () => "ffmpeg" }));

const run = (result: { stdout?: string; err?: Error }) =>
  vi.mocked(execFile).mockImplementation(((_f: any, _a: any, _o: any, cb: any) => {
    if (result.err) cb(result.err, { stdout: "", stderr: "" });
    else cb(null, { stdout: result.stdout, stderr: "" });
    return {} as any;
  }) as any);

describe("parseRmsLevels", () => {
  it("reads every RMS level, flooring silence at -90 dB", () => {
    const out = "frame:0\nlavfi.astats.Overall.RMS_level=-23.5\nlavfi.astats.Overall.RMS_level=-inf\nlavfi.astats.Overall.RMS_level=-120.0\nlavfi.astats.Overall.RMS_level=-0.0";
    expect(parseRmsLevels(out)).toEqual([-23.5, -90, -90, -90]);
  });
});

describe("computeAudioSignals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns per-second levels", async () => {
    run({ stdout: "lavfi.astats.Overall.RMS_level=-20\nlavfi.astats.Overall.RMS_level=-30" });
    expect(await computeAudioSignals("a.mp4")).toEqual({ rmsPerSecond: [-20, -30] });
  });

  it("is null when ffmpeg fails or yields nothing", async () => {
    run({ err: new Error("boom") });
    expect(await computeAudioSignals("a.mp4")).toBeNull();
    run({ stdout: "" });
    expect(await computeAudioSignals("a.mp4")).toBeNull();
  });
});

describe("energyBonus", () => {
  const signals = { rmsPerSecond: [-40, -40, -40, -40, -20, -20, -20, -20, -90, -90] };

  it("rewards louder-than-average spans, capped at 0.5", () => {
    expect(energyBonus(4, 8, signals)).toBe(0.5);
    expect(energyBonus(0, 4, signals)).toBe(0);
  });

  it("scales linearly below the cap", () => {
    const mild = { rmsPerSecond: [-30, -30, -27, -27] };
    expect(energyBonus(2, 4, mild)).toBeCloseTo(0.125, 3);
  });

  it("is 0 for spans outside the audio or entirely silent audio", () => {
    expect(energyBonus(50, 60, signals)).toBe(0);
    expect(energyBonus(0, 2, { rmsPerSecond: [-90, -90] })).toBe(0);
  });
});

describe("buildEnergyHint", () => {
  it("names the most energetic non-overlapping spans in order", () => {
    const quiet = Array(60).fill(-40);
    const levels = [...quiet.slice(0, 5), ...Array(20).fill(-15), ...quiet.slice(0, 15), ...Array(20).fill(-18)];
    const hint = buildEnergyHint({ rmsPerSecond: levels }, 2);
    expect(hint).toContain("SINAIS DE ÁUDIO");
    expect(hint).toContain("0:05-0:25");
    expect(hint).toContain("0:40-1:00");
  });

  it("is empty when the audio is shorter than a span", () => {
    expect(buildEnergyHint({ rmsPerSecond: [-20, -20] })).toBe("");
  });
});
