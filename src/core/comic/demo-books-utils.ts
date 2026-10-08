import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ComicBook } from "./comic-types.js";
import { buildFontEnv } from "../ffmpeg-env.js";
import { ffmpegBin } from "../ffmpeg-bin.js";

const execFileAsync = promisify(execFile);

export interface DemoChapter {
  id: string;
  title: string;
  narrationText: string;
}

export async function buildColorCardBook(
  workDir: string,
  id: string,
  title: string,
  chapters: DemoChapter[],
): Promise<ComicBook> {
  fs.mkdirSync(workDir, { recursive: true });

  const palette = ["0x1a1a2e", "0x16213e", "0x0f3460", "0x2c1e4a"];
  for (const [index, chapter] of chapters.entries()) {
    const imagePath = path.join(workDir, `${chapter.id}.png`);
    const args = [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=${palette[index % palette.length]}:s=1080x1920`,
      "-frames:v", "1",
      imagePath,
    ];
    await execFileAsync(ffmpegBin(), args, { maxBuffer: 8 * 1024 * 1024, env: buildFontEnv() });
  }

  return {
    id,
    title,
    chapters: chapters.map((chapter) => ({
      ...chapter,
      imagePath: path.join(workDir, `${chapter.id}.png`),
    })),
  };
}
