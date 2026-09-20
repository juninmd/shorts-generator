import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import type { TranscriptWord } from "../../types.js";
import type { ComicChapter, NarratedChapter } from "./comic-types.js";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);

function scriptPath(): string {
  return path.resolve(process.cwd(), "scripts", "comic_tts.py");
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata?.format?.duration ?? 0);
    });
  });
}

/**
 * Synthesize narration audio (edge-tts, free/offline-key) with word-level
 * timestamps for one comic chapter. Requires Python + the `edge-tts` package.
 */
export async function narrateChapter(
  chapter: ComicChapter,
  outputDir: string,
  voice: string,
): Promise<NarratedChapter> {
  const script = scriptPath();
  if (!fs.existsSync(script)) {
    throw new Error(`Missing TTS helper script: ${script}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const textPath = path.join(outputDir, `${chapter.id}.txt`);
  const audioPath = path.join(outputDir, `${chapter.id}.mp3`);
  const wordsPath = path.join(outputDir, `${chapter.id}.words.json`);
  fs.writeFileSync(textPath, chapter.narrationText, "utf-8");

  const python = process.env.PYTHON_BIN || "python";
  logger.info({ chapterId: chapter.id, voice }, "Synthesizing chapter narration");
  await execFileAsync(python, [script, textPath, audioPath, wordsPath, voice], {
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  const words: TranscriptWord[] = JSON.parse(fs.readFileSync(wordsPath, "utf-8"));
  const durationSec = await getVideoDuration(audioPath);

  return { ...chapter, audioPath, durationSec, words };
}

export async function narrateChapters(
  chapters: ComicChapter[],
  outputDir: string,
  voice: string,
): Promise<NarratedChapter[]> {
  const result: NarratedChapter[] = [];
  for (const chapter of chapters) {
    result.push(await narrateChapter(chapter, outputDir, voice));
  }
  return result;
}
