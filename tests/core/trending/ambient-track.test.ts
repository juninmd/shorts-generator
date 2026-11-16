import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ambientPadArgs, ensureAmbientPad } from "../../../src/core/trending/ambient-track.js";
import { runFfmpeg } from "../../../src/core/ffmpeg-run.js";

vi.mock("../../../src/core/ffmpeg-run.js", () => ({ runFfmpeg: vi.fn().mockResolvedValue({ stderr: "" }) }));

describe("ambient-track", () => {
  let dir: string;
  beforeEach(() => {
    vi.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "trend-pad-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("synthesizes a low-passed pad of the requested length", () => {
    const args = ambientPadArgs(90, "/out/pad.mp3");
    const expression = args[args.indexOf("-i") + 1]!;
    expect(expression).toContain("d=90.00");
    expect(expression).toContain("sin(2*PI*130.81*t)");
    expect(args).toContain("lowpass=f=900");
    expect(args.at(-1)).toBe("/out/pad.mp3");
  });

  it("writes the pad into the directory with ffmpeg", async () => {
    const target = path.join(dir, "nested", "trending");
    await expect(ensureAmbientPad(target, 30)).resolves.toBe(path.join(target, "ambient-pad.mp3"));
    expect(fs.existsSync(target)).toBe(true);
    expect(runFfmpeg).toHaveBeenCalledWith(expect.arrayContaining([path.join(target, "ambient-pad.mp3")]));
  });

  it("accepts an injected runner and a default duration", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    await ensureAmbientPad(dir, undefined, run);
    expect(run.mock.calls[0]?.[0]).toContain(path.join(dir, "ambient-pad.mp3"));
    expect(run.mock.calls[0]?.[0]?.[2]).toBe("lavfi");
  });
});
