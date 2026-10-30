import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { normalizeLoudness } from "../../src/core/loudness.js";
import { runFfmpeg } from "../../src/core/ffmpeg-run.js";
import { probeFormat } from "../../src/core/ffmpeg-bin.js";
import { DELIVERY_SPECS } from "../../src/core/delivery-spec.js";

vi.mock("node:fs", () => ({ default: { renameSync: vi.fn(), rmSync: vi.fn() } }));
vi.mock("../../src/core/ffmpeg-run.js", () => ({ runFfmpeg: vi.fn() }));
vi.mock("../../src/core/ffmpeg-bin.js", () => ({ probeFormat: vi.fn() }));
vi.mock("../../src/core/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const spec = DELIVERY_SPECS.shorts!;

const loudnorm = (lufs: number, tp: number): string => JSON.stringify({
  input_i: String(lufs), input_tp: String(tp), input_lra: "6.4",
  input_thresh: "-31.7", target_offset: "0.1",
});

interface MockPlan {
  /** stderr of each measurement, in order; a measurement is the `-f null -` call. */
  measurements: string[];
  /** set to throw for every encode */
  failEncode?: Error;
  probe?: () => Promise<{ duration?: string }>;
}

function plan(options: MockPlan): string[][] {
  const encodes: string[][] = [];
  let measured = 0;
  vi.mocked(runFfmpeg).mockImplementation(async (args: string[]) => {
    if (args.includes("null")) {
      const stderr = options.measurements[Math.min(measured, options.measurements.length - 1)];
      measured += 1;
      if (stderr === undefined) throw new Error("no audio stream");
      return { stderr, durationMs: 1 };
    }
    if (options.failEncode) throw options.failEncode;
    encodes.push(args);
    return { stderr: "", durationMs: 1 };
  });
  vi.mocked(probeFormat).mockImplementation(options.probe ?? (async () => ({ duration: "10.5" })));
  return encodes;
}

describe("loudness normalisation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing when LOUDNESS_NORMALIZE=false", async () => {
    vi.stubEnv("LOUDNESS_NORMALIZE", "false");
    const result = await normalizeLoudness("out.mp4", spec);
    expect(result).toEqual({ normalized: false, lufs: null, tp: null, encodes: 0, reason: "disabled" });
    expect(runFfmpeg).not.toHaveBeenCalled();
  });

  it("skips a file whose audio cannot be measured", async () => {
    plan({ measurements: [] });
    const result = await normalizeLoudness("out.mp4", spec);
    expect(result.reason).toBe("no_audio");
    expect(fs.renameSync).not.toHaveBeenCalled();
  });

  it("leaves a file that is already on target untouched", async () => {
    plan({ measurements: [loudnorm(-14.2, -1.4)] });
    const result = await normalizeLoudness("out.mp4", spec);
    expect(result).toEqual({ normalized: false, lufs: -14.2, tp: -1.4, encodes: 0, reason: "on_target" });
    expect(fs.renameSync).not.toHaveBeenCalled();
  });

  it("normalises a quiet file in one audio-only pass and verifies it", async () => {
    const encodes = plan({ measurements: [loudnorm(-21.3, -3.2), loudnorm(-14.2, -1.2)] });

    const result = await normalizeLoudness("/videos/out.mp4", spec);

    expect(result).toMatchObject({ normalized: true, lufs: -14.2, tp: -1.2, encodes: 1 });
    expect(encodes[0]).toEqual(expect.arrayContaining(["-c:v", "copy", "-ar", "48000", "-ac", "2", "-b:a", "192k"]));
    expect(encodes[0]!.join(" ")).toContain("atrim=duration=10.500");
    expect(encodes[0]!.join(" ")).toContain("measured_I=-21.3");
    expect(fs.renameSync).toHaveBeenCalledWith(expect.stringMatching(/\.out\.loudnorm\.mp4$/), "/videos/out.mp4");
  });

  it("raises the bitrate when the AAC encoder overshoots the peak ceiling", async () => {
    const encodes = plan({
      measurements: [loudnorm(-21.3, -3.2), loudnorm(-14.1, -0.4), loudnorm(-14.1, -0.4), loudnorm(-14.1, -0.4)],
    });

    const result = await normalizeLoudness("out.mp4", spec);

    expect(result.encodes).toBe(3);
    expect(encodes.map((args) => args[args.indexOf("-b:a") + 1])).toEqual(["192k", "256k", "320k"]);
  });

  it("reports a normalised file whose new levels could not be read", async () => {
    plan({ measurements: [loudnorm(-21.3, -3.2), loudnorm(Number.NaN, Number.NaN)] });
    const result = await normalizeLoudness("out.mp4", spec);
    expect(result).toEqual({ normalized: true, lufs: null, tp: null, encodes: 1, reason: "unverified" });
  });

  it("keeps the render when the encode itself fails, and removes the temp file", async () => {
    plan({ measurements: [loudnorm(-21.3, -3.2)], failEncode: new Error("aac exploded") });

    const result = await normalizeLoudness("/videos/out.mp4", spec);

    expect(result).toMatchObject({ normalized: false, encodes: 0, reason: "aac exploded" });
    expect(fs.rmSync).toHaveBeenCalledWith(expect.stringMatching(/\.out\.loudnorm\.mp4$/), { force: true });
  });

  it("omits the trim when the input duration is unreadable", async () => {
    const unreadable = plan({
      measurements: [loudnorm(-21.3, -3.2), loudnorm(-14.2, -1.2)],
      probe: async () => { throw new Error("probe failed"); },
    });
    await normalizeLoudness("out.mp4", spec);
    expect(unreadable[0]!.join(" ")).not.toContain("atrim");

    const zero = plan({
      measurements: [loudnorm(-21.3, -3.2), loudnorm(-14.2, -1.2)],
      probe: async () => ({ duration: "0" }),
    });
    await normalizeLoudness("out.mp4", spec);
    expect(zero[0]!.join(" ")).not.toContain("atrim");

    const garbage = plan({
      measurements: [loudnorm(-21.3, -3.2), loudnorm(-14.2, -1.2)],
      probe: async () => ({ duration: "n/a" }),
    });
    await normalizeLoudness("out.mp4", spec);
    expect(garbage[0]!.join(" ")).not.toContain("atrim");

    const absent = plan({
      measurements: [loudnorm(-21.3, -3.2), loudnorm(-14.2, -1.2)],
      probe: async () => ({}),
    });
    await normalizeLoudness("out.mp4", spec);
    expect(absent[0]!.join(" ")).not.toContain("atrim");
  });
});
