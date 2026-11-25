import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { TranscriptWord } from "../../types.js";
import type { ComicChapter, NarratedChapter } from "./comic-types.js";
import { logger } from "../logger.js";
import { getVideoDuration } from "../video-processor.js";

const execFileAsync = promisify(execFile);

export type TtsEngine = "edge" | "kokoro";

/** TTS_ENGINE=kokoro switches the edge-tts flows built on narrateChapter (comic, faceless, bible) to Kokoro. */
export function resolveTtsEngine(env: NodeJS.ProcessEnv = process.env): TtsEngine {
  return env.TTS_ENGINE?.trim().toLowerCase() === "kokoro" ? "kokoro" : "edge";
}

// Kokoro synthesizes on CPU and loads a 325 MB model per call, so it gets a longer ceiling.
const ENGINES: Record<TtsEngine, { script: string; ext: string; timeoutMs: number }> = {
  edge: { script: "comic_tts.py", ext: "mp3", timeoutMs: 120_000 },
  kokoro: { script: "kokoro_tts.py", ext: "wav", timeoutMs: 600_000 },
};

/** Kokoro has its own voice ids (pm_alex, pm_santa, pf_dora), so edge voice names never leak into it. */
function voiceFor(engine: TtsEngine, voice: string): string {
  return engine === "kokoro" ? process.env.KOKORO_VOICE || "pm_alex" : voice;
}

/**
 * Synthesize narration audio with word-level timestamps for one comic chapter.
 * edge-tts (default) needs the `edge-tts` package; Kokoro needs `kokoro-onnx` and KOKORO_MODEL_DIR.
 */
export async function narrateChapter(
  chapter: ComicChapter,
  outputDir: string,
  edgeVoice: string,
  engine: TtsEngine = resolveTtsEngine(),
): Promise<NarratedChapter> {
  const { script: scriptName, ext, timeoutMs } = ENGINES[engine];
  const script = path.resolve(process.cwd(), "scripts", scriptName);
  const voice = voiceFor(engine, edgeVoice);
  if (!fs.existsSync(script)) {
    throw new Error(`Missing TTS helper script: ${script}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const textPath = path.join(outputDir, `${chapter.id}.txt`);
  const audioPath = path.join(outputDir, `${chapter.id}.${ext}`);
  const wordsPath = path.join(outputDir, `${chapter.id}.words.json`);
  fs.writeFileSync(textPath, chapter.narrationText, "utf-8");

  const python = process.env.PYTHON_BIN || "python";
  logger.info({ chapterId: chapter.id, engine, voice }, "Synthesizing chapter narration");
  await execFileAsync(python, [script, textPath, audioPath, wordsPath, voice], {
    timeout: timeoutMs,
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
