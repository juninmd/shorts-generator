import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { NarratedChapter } from "../comic/comic-types.js";
import type { StickChapter } from "./animated-types.js";

const execFileAsync = promisify(execFile);

export interface FrameSize {
  width: number;
  height: number;
  fps: number;
}

function scriptPath(): string {
  return path.resolve(process.cwd(), "scripts", "stick_render.py");
}

/** Hands a JSON spec to scripts/stick_render.py (Pillow frames piped into ffmpeg). */
async function runRenderer(spec: Record<string, unknown>, specPath: string): Promise<void> {
  fs.writeFileSync(specPath, JSON.stringify(spec), "utf-8");
  try {
    const python = process.env.PYTHON_BIN || "python";
    await execFileAsync(python, [scriptPath(), specPath], {
      timeout: 900_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } finally {
    fs.rmSync(specPath, { force: true });
  }
}

export async function renderStickPoster(chapter: StickChapter, posterPath: string, size: FrameSize): Promise<void> {
  await runRenderer(
    { ...size, poster: posterPath, pose: chapter.pose, prop: chapter.prop, title: chapter.title },
    `${posterPath}.json`,
  );
}

/** Renders the animated chapter for its narration length; an empty audioPath yields silence. */
export async function renderStickClip(
  chapter: StickChapter,
  narrated: NarratedChapter,
  outputPath: string,
  size: FrameSize,
): Promise<void> {
  await runRenderer(
    {
      ...size,
      out: outputPath,
      durationSec: narrated.durationSec,
      audio: narrated.audioPath,
      pose: chapter.pose,
      prop: chapter.prop,
      title: chapter.title,
    },
    `${outputPath}.json`,
  );
}
