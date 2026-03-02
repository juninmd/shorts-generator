import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import type {
  Transcript,
  TranscriptSegment,
  TranscriptWord,
  DownloadedVideo,
  PipelineConfig,
} from "../types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

/**
 * Transcribe a video using local openai-whisper CLI with word-level timestamps.
 * Completely free — no API calls, runs entirely on CPU/GPU locally.
 *
 * Requires: pip install openai-whisper
 */
export async function transcribeVideo(
  video: DownloadedVideo,
  config: PipelineConfig,
): Promise<Transcript> {
  logger.info(
    { videoId: video.id, title: video.title, model: config.whisperModel },
    "Starting local Whisper transcription",
  );

  const outputDir = path.join(config.tempDir, video.id, "whisper_out");
  fs.mkdirSync(outputDir, { recursive: true });

  // Run local whisper CLI — outputs JSON with word-level timestamps
  await execFileAsync(
    "whisper",
    [
      video.audioPath,
      "--model",
      config.whisperModel,
      "--output_format",
      "json",
      "--output_dir",
      outputDir,
      "--word_timestamps",
      "True",
    ],
    { maxBuffer: 50 * 1024 * 1024, timeout: 1_800_000 }, // 30 min timeout
  );

  // Find the generated JSON file
  const audioBaseName = path.basename(video.audioPath, path.extname(video.audioPath));
  const jsonPath = path.join(outputDir, `${audioBaseName}.json`);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Whisper output not found at ${jsonPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  const allSegments: TranscriptSegment[] = [];
  const allWords: TranscriptWord[] = [];
  let detectedLanguage = raw.language ?? "pt";

  for (const seg of raw.segments ?? []) {
    allSegments.push({
      start: seg.start ?? 0,
      end: seg.end ?? 0,
      text: (seg.text ?? "").trim(),
    });

    // Extract word-level timestamps from segment
    for (const w of seg.words ?? []) {
      allWords.push({
        word: (w.word ?? "").trim(),
        start: w.start ?? 0,
        end: w.end ?? 0,
      });
    }
  }

  // Sort by start time
  allSegments.sort((a, b) => a.start - b.start);
  allWords.sort((a, b) => a.start - b.start);

  const transcript: Transcript = {
    videoId: video.id,
    segments: allSegments,
    words: allWords,
    fullText: allSegments.map((s) => s.text).join(" "),
    language: detectedLanguage,
    duration: video.duration,
  };

  // Cleanup whisper output
  fs.rmSync(outputDir, { recursive: true, force: true });

  logger.info(
    {
      videoId: video.id,
      segmentCount: allSegments.length,
      wordCount: allWords.length,
      language: detectedLanguage,
    },
    "Local Whisper transcription complete",
  );

  return transcript;
}
