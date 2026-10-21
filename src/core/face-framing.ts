import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ShortClip } from "../types.js";
import { logger } from "./logger.js";
import {
  buildFocusExpression, parseTrackerOutput, simplifyKeyframes, type FocusKeyframe,
} from "./focus-keyframes.js";

const execFileAsync = promisify(execFile);

/** Centered crop. Used when detection is disabled or fails. */
export const CENTER_FOCUS = 0.5;

function detectScriptPath(): string {
  return path.resolve(process.cwd(), "scripts", "detect_face.py");
}

/**
 * Find the horizontal position (0=left, 1=right) of the main speaker's face
 * within a clip so the vertical crop can keep them framed. Best-effort: returns
 * {@link CENTER_FOCUS} when speaker focusing is disabled, the helper is missing,
 * OpenCV is unavailable, or no face is found — preserving the centered crop.
 */
export async function detectSpeakerFocusX(
  inputPath: string,
  clip: Pick<ShortClip, "startTime" | "duration">,
): Promise<number> {
  if (process.env.SPEAKER_FOCUS === "false") return CENTER_FOCUS;

  const script = detectScriptPath();
  if (!fs.existsSync(script)) return CENTER_FOCUS;

  const python = process.env.PYTHON_BIN || "python3";
  try {
    const { stdout } = await execFileAsync(
      python,
      [script, inputPath, String(clip.startTime), String(clip.duration)],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const value = Number.parseFloat(String(stdout).trim());
    if (!Number.isFinite(value)) return CENTER_FOCUS;
    const focusX = Math.max(0, Math.min(1, value));
    logger.info({ inputPath, focusX }, "Speaker face detected, biasing crop");
    return focusX;
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "Speaker face detection unavailable, using centered crop",
    );
    return CENTER_FOCUS;
  }
}

/**
 * Follow the active speaker through the clip: face detection plus mouth-motion
 * analysis (scripts/track_speaker.py) yields focus keyframes so the vertical
 * crop pans between people as they take turns. Returns [] when tracking is
 * disabled or unavailable so the caller falls back to the static focus.
 */
export async function trackSpeakerFocus(
  inputPath: string,
  clip: Pick<ShortClip, "startTime" | "duration">,
  cuts: number[] = [],
): Promise<FocusKeyframe[]> {
  if (process.env.SPEAKER_FOCUS === "false" || process.env.SPEAKER_TRACKING === "false") return [];
  const script = path.resolve(process.cwd(), "scripts", "track_speaker.py");
  if (!fs.existsSync(script)) return [];
  try {
    const { stdout } = await execFileAsync(
      process.env.PYTHON_BIN || "python3",
      [script, inputPath, String(clip.startTime), String(clip.duration)],
      { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const keyframes = simplifyKeyframes(parseTrackerOutput(String(stdout)), cuts);
    logger.info({ inputPath, keyframes: keyframes.length }, "Speaker tracked, panning crop");
    return keyframes;
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "Speaker tracking unavailable, using static focus",
    );
    return [];
  }
}

/** Tracked keyframes when available, otherwise the static single-position focus. */
export async function resolveSpeakerFocus(
  inputPath: string,
  clip: Pick<ShortClip, "startTime" | "duration">,
  cuts: number[] = [],
): Promise<number | FocusKeyframe[]> {
  const keyframes = await trackSpeakerFocus(inputPath, clip, cuts);
  return keyframes.length > 0 ? keyframes : detectSpeakerFocusX(inputPath, clip);
}

/**
 * ffmpeg crop `x` expression keeping the focus point centered. The frame is
 * expected to carry {@link edgePadFilter} borders, so a speaker sitting at the
 * far left/right of a wide shot (podcast guests) still lands in the middle of
 * the vertical crop instead of the crop clamping at the frame edge.
 */
export function buildCropXExpression(width: number, focus: number | FocusKeyframe[]): string {
  const position = typeof focus === "number"
    ? Math.max(0, Math.min(1, focus)).toFixed(4)
    : `(${buildFocusExpression(focus)})`;
  return `'clip((in_w-${width})*${position}\\,0\\,in_w-${width})'`;
}

/** Extends the frame half a crop width on each side (edge pixels smeared) so edge speakers can be centered. */
export function edgePadFilter(width: number): string {
  const side = Math.ceil(width / 2);
  return `pad=iw+${side * 2}:ih:${side}:0,fillborders=left=${side}:right=${side}:mode=smear`;
}
