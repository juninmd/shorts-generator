import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { NarratedChapter } from "../comic/comic-types.js";
import type { StickChapter, StickStyle } from "./animated-types.js";

const execFileAsync = promisify(execFile);

export interface FrameSize {
  width: number;
  height: number;
  fps: number;
}

function scriptPath(): string {
  return path.resolve(process.cwd(), "scripts", "stickman_render.py");
}

/** Hands a JSON spec to scripts/stickman_render.py (supersampled Pillow frames piped into ffmpeg). */
async function runRenderer(spec: Record<string, unknown>, specPath: string): Promise<void> {
  fs.writeFileSync(specPath, JSON.stringify(spec), "utf-8");
  try {
    const python = process.env.PYTHON_BIN || "python";
    await execFileAsync(python, [scriptPath(), specPath], {
      timeout: 1_800_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } finally {
    fs.rmSync(specPath, { force: true });
  }
}

function sceneOf(chapter: StickChapter, style: StickStyle) {
  return { style, heading: chapter.heading, emphasis: chapter.emphasis ?? "", beats: chapter.beats };
}

/** Thumbnail of the chapter's end state (every beat fired), also the comic pipeline's still. */
export async function renderStickPoster(
  chapter: StickChapter,
  style: StickStyle,
  posterPath: string,
  size: FrameSize,
): Promise<void> {
  await runRenderer({ ...size, ...sceneOf(chapter, style), poster: posterPath }, `${posterPath}.json`);
}

/**
 * Renders the animated chapter for its narration length. Word timings drive beat cues,
 * lip movement and the style's own captions; an empty audioPath yields effects only.
 */
export async function renderStickClip(
  chapter: StickChapter,
  style: StickStyle,
  narrated: NarratedChapter,
  outputPath: string,
  size: FrameSize,
): Promise<void> {
  await runRenderer(
    {
      ...size,
      ...sceneOf(chapter, style),
      enter: chapter.enter ?? false,
      out: outputPath,
      durationSec: narrated.durationSec,
      audio: narrated.audioPath,
      words: narrated.words,
    },
    `${outputPath}.json`,
  );
}
