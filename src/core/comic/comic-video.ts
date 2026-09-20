import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import type { NarratedChapter } from "./comic-types.js";
import { logger } from "../logger.js";
import { buildFontEnv } from "../ffmpeg-env.js";

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
  return (ffmpeg as any).ffmpegPath?.() ?? "ffmpeg";
}

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/**
 * Render one chapter: still image + narration audio, with a slow Ken Burns
 * zoom so a static comic page doesn't feel dead on video.
 */
export async function renderChapterClip(
  chapter: NarratedChapter,
  outputPath: string,
  width: number,
  height: number,
): Promise<void> {
  const frames = Math.max(1, Math.round(chapter.durationSec * 30));
  const zoomFilter =
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,` +
    `crop=${width * 2}:${height * 2},` +
    `zoompan=z='min(zoom+0.0006,1.15)':d=${frames}:s=${width}x${height}:fps=30`;

  const args = [
    "-y",
    "-loop", "1",
    "-i", chapter.imagePath,
    "-i", chapter.audioPath,
    "-vf", zoomFilter,
    "-c:v", "libx264",
    "-t", String(chapter.durationSec),
    "-c:a", "aac",
    "-pix_fmt", "yuv420p",
    "-shortest",
    outputPath,
  ];
  await execFileAsync(getFfmpegPath(), args, { maxBuffer: 16 * 1024 * 1024 });
}

/** Concatenate rendered chapter clips into a single video via the concat demuxer. */
export async function concatChapterClips(
  clipPaths: string[],
  outputPath: string,
  workDir: string,
): Promise<void> {
  const listPath = path.join(workDir, "concat-list.txt");
  const listContent = clipPaths
    .map((clipPath) => `file '${path.resolve(clipPath).replace(/\\/g, "/")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listContent, "utf-8");

  const args = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    outputPath,
  ];
  await execFileAsync(getFfmpegPath(), args, { maxBuffer: 16 * 1024 * 1024 });
}

/** Burn ASS subtitles onto the concatenated video. */
export async function burnSubtitles(
  inputPath: string,
  subtitlePath: string,
  outputPath: string,
): Promise<void> {
  const assPath = escapeFilterPath(subtitlePath);
  const args = [
    "-y",
    "-i", inputPath,
    "-vf", `subtitles='${assPath}'`,
    "-c:v", "libx264",
    "-c:a", "copy",
    "-pix_fmt", "yuv420p",
    outputPath,
  ];
  logger.info({ inputPath, outputPath }, "Burning comic subtitles");
  await execFileAsync(getFfmpegPath(), args, { maxBuffer: 16 * 1024 * 1024, env: buildFontEnv() });
}
