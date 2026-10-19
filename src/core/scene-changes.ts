import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegBin } from "./ffmpeg-bin.js";

const execFileAsync = promisify(execFile);

/** Timestamps (seconds from the section start) of the camera cuts in showinfo's log. */
export function parseSceneTimes(log: string): number[] {
  return [...log.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)].map((match) => Number.parseFloat(match[1]!));
}

/**
 * Camera cuts inside the clip, relative to its start. Used so the speaker-tracking
 * crop jumps at a cut instead of panning across it. Best-effort: [] on failure.
 */
export async function detectSceneChanges(
  inputPath: string,
  startTime: number,
  duration: number,
): Promise<number[]> {
  try {
    const { stderr } = await execFileAsync(ffmpegBin(), [
      "-v", "info", "-ss", String(startTime), "-t", String(duration), "-i", inputPath,
      "-vf", "select='gt(scene,0.3)',showinfo", "-an", "-f", "null", "-",
    ], { maxBuffer: 32 * 1024 * 1024 });
    return parseSceneTimes(String(stderr));
  } catch {
    return [];
  }
}
