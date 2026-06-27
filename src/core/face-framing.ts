import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ShortClip } from "../types.js";
import { logger } from "./logger.js";

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
