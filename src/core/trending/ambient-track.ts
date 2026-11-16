import fs from "node:fs";
import path from "node:path";
import { runFfmpeg } from "../ffmpeg-run.js";

/** A soft A-minor-style pad: root, third, fifth and seventh, low-passed and slowly swelling. */
export const AMBIENT_TONES_HZ = [130.81, 164.81, 196, 246.94];

/**
 * ffmpeg arguments that synthesize the ambient pad. The track is generated from
 * a formula, so it carries no third-party copyright; the pipeline loops it under
 * the narration with ducking.
 */
export function ambientPadArgs(durationSec: number, outPath: string): string[] {
  const tones = AMBIENT_TONES_HZ.map((hz) => `sin(2*PI*${hz}*t)`).join("+");
  const expression = `0.09*(${tones})*(0.65+0.35*sin(2*PI*0.2*t))`;
  return [
    "-y",
    "-f", "lavfi",
    "-i", `aevalsrc=${expression}:s=44100:d=${durationSec.toFixed(2)}`,
    "-af", "lowpass=f=900",
    "-c:a", "libmp3lame",
    "-b:a", "96k",
    outPath,
  ];
}

/** Writes the pad into `dir` once and returns its path. */
export async function ensureAmbientPad(
  dir: string,
  durationSec = 120,
  run: (args: string[]) => Promise<unknown> = (args) => runFfmpeg(args),
): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, "ambient-pad.mp3");
  await run(ambientPadArgs(durationSec, outPath));
  return outPath;
}
