
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Transcript, TranscriptSegment, TranscriptWord, DownloadedVideo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import {
  AUDIO_CHUNK_DURATION_SEC,
  splitAudioIntoChunks,
  mergeWhisperOutputs,
  cleanupChunkFiles,
  type WhisperOutput,
} from "./audio-chunker.js";

const execFileAsync = promisify(execFile);

/* v8 ignore start */
async function findUvBinary(): Promise<string> {
  const isWindows = process.platform === "win32";
  const home = os.homedir();
  const candidates = [
    "uv",
    path.join(home, ".local", "bin", isWindows ? "uv.exe" : "uv"),
    path.join(home, ".cargo", "bin", isWindows ? "uv.exe" : "uv"),
    path.join(home, "bin", isWindows ? "uv.exe" : "uv"),
    ...(isWindows
      ? [path.join(home, ".local", "bin", "uv.exe"), path.join(process.env.LOCALAPPDATA ?? "", "uv", "bin", "uv.exe")]
      : []),
  ];
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ["--version"], { timeout: 5_000 });
      const match = stdout.trim().match(/uv (\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1]!, 10);
        const minor = parseInt(match[2]!, 10);
        if (major > 0 || minor >= 2) return candidate;
      }
    } catch { /* try next */ }
  }
  throw new Error("No compatible uv installation found (requires uv >= 0.2.0).");
}
/* v8 ignore stop */

async function runWhisperOnFile(
  audioPath: string,
  outputDir: string,
  whisperModel: string,
  uvBin: string,
  useGpu: boolean,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const scriptPath = path.join(process.cwd(), "scripts", "transcribe_faster.py");
  const pyProjectDir = path.join(process.cwd(), "tests", "yt-download");
  const env = { ...process.env, WHISPER_USE_GPU: useGpu ? "true" : "false" };

  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      uvBin,
      ["run", "--project", pyProjectDir, "python", scriptPath, audioPath, "--model", whisperModel, "--output_dir", outputDir],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout.setEncoding("utf8");
    /* v8 ignore start */
    child.stdout.on("data", (data: string) => {
      for (const line of data.split("\n")) {
        const m = line.match(/PROGRESS: (\d+(?:\.\d+)?)/);
        if (m && onProgress) onProgress(parseFloat(m[1]!));
      }
    });
    /* v8 ignore stop */
    /* v8 ignore start */
    let stderr = "";
    child.stderr.on("data", (d: string) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code: number) => {
      code === 0 ? resolve() : reject(new Error(stderr || `Transcription failed with code ${code}`));
    });
    /* v8 ignore stop */
  });
}

async function transcribeAudioFile(
  audioPath: string,
  outputDir: string,
  whisperModel: string,
  uvBin: string,
  onProgress?: (pct: number) => void,
): Promise<WhisperOutput> {
  const useGpu = process.env.WHISPER_USE_GPU?.toLowerCase() === "true";
  try {
    await runWhisperOnFile(audioPath, outputDir, whisperModel, uvBin, useGpu, onProgress);
  } catch (err) {
    /* v8 ignore start */
    if (useGpu) {
      logger.warn({ err }, "GPU transcription failed, retrying with CPU");
      await runWhisperOnFile(audioPath, outputDir, whisperModel, uvBin, false, onProgress);
    } else throw err;
    /* v8 ignore stop */
  }
  const baseName = path.basename(audioPath, path.extname(audioPath));
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  if (!fs.existsSync(jsonPath)) throw new Error(`Whisper output not found at ${jsonPath}`);
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as WhisperOutput;
  fs.unlinkSync(jsonPath);
  return raw;
}

 /* v8 ignore start */
export async function transcribeVideo(video: DownloadedVideo, config: PipelineConfig): Promise<Transcript> {
  logger.info({ videoId: video.id, title: video.title, model: config.whisperModel }, "Starting local Whisper transcription");

  const outputDir = path.join(config.tempDir, video.id, "whisper_out");
  fs.mkdirSync(outputDir, { recursive: true });
  const uvBin = await findUvBinary();
  const onProgress = (config as any).onProgress as ((pct: number) => void) | undefined;

  let raw: WhisperOutput;

  if (video.duration > AUDIO_CHUNK_DURATION_SEC) {
    const chunkCount = Math.ceil(video.duration / AUDIO_CHUNK_DURATION_SEC);
    logger.info({ videoId: video.id, durationSec: video.duration, chunkCount }, "Audio too long — splitting into chunks");
    const chunks = await splitAudioIntoChunks(video.audioPath, video.duration, AUDIO_CHUNK_DURATION_SEC, outputDir);
    const chunkOutputs: { data: WhisperOutput; offsetSec: number }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const { path: chunkPath, offsetSec } = chunks[i]!;
      logger.info({ videoId: video.id, chunk: i + 1, of: chunks.length, offsetSec }, "Transcribing audio chunk");
      const chunkOnProgress = onProgress
        ? (pct: number) => onProgress(((i + pct / 100) / chunks.length) * 100)
        : undefined;
      const data = await transcribeAudioFile(chunkPath, outputDir, config.whisperModel, uvBin, chunkOnProgress);
      chunkOutputs.push({ data, offsetSec });
    }
    cleanupChunkFiles(chunks);
    raw = mergeWhisperOutputs(chunkOutputs);
  } else {
    raw = await transcribeAudioFile(video.audioPath, outputDir, config.whisperModel, uvBin, onProgress);
  }

  fs.rmSync(outputDir, { recursive: true, force: true });

  const allSegments: TranscriptSegment[] = [];
  const allWords: TranscriptWord[] = [];

  for (const seg of raw.segments ?? []) {
    allSegments.push({ start: seg.start ?? 0, end: seg.end ?? 0, text: (seg.text ?? "").trim() });
    for (const w of (seg as any).words ?? []) {
      allWords.push({ word: (w.word ?? "").trim(), start: w.start ?? 0, end: w.end ?? 0 });
    }
  }

  allSegments.sort((a, b) => a.start - b.start);
  allWords.sort((a, b) => a.start - b.start);

  logger.info(
    { videoId: video.id, segmentCount: allSegments.length, wordCount: allWords.length, language: raw.language },
    "Local Whisper transcription complete",
  );

  return {
    videoId: video.id,
    segments: allSegments,
    words: allWords,
    fullText: allSegments.map((s) => s.text).join(" "),
    language: raw.language ?? "pt",
    duration: video.duration,
  };
}
