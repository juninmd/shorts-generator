import OpenAI from "openai";
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

const MAX_WHISPER_FILE_SIZE = 25 * 1024 * 1024; // 25 MB limit for Whisper API
const CHUNK_DURATION_SECONDS = 600; // 10 minutes per chunk

/**
 * Transcribe a video using OpenAI Whisper API with word-level timestamps.
 * Handles large files by splitting audio into chunks.
 */
export async function transcribeVideo(
  video: DownloadedVideo,
  config: PipelineConfig,
): Promise<Transcript> {
  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  logger.info({ videoId: video.id, title: video.title }, "Starting transcription");

  const audioSize = fs.statSync(video.audioPath).size;
  let allSegments: TranscriptSegment[] = [];
  let allWords: TranscriptWord[] = [];
  let detectedLanguage = "pt";

  if (audioSize <= MAX_WHISPER_FILE_SIZE) {
    // Single file transcription
    const result = await transcribeChunk(openai, video.audioPath, config, 0);
    allSegments = result.segments;
    allWords = result.words;
    detectedLanguage = result.language;
  } else {
    // Split into chunks and transcribe each
    logger.info({ audioSize, videoId: video.id }, "Audio too large, splitting into chunks");
    const chunks = await splitAudio(video.audioPath, video.id, config);

    for (const chunk of chunks) {
      const result = await transcribeChunk(openai, chunk.path, config, chunk.offsetSeconds);
      allSegments.push(...result.segments);
      allWords.push(...result.words);
      if (result.language) detectedLanguage = result.language;
      // Clean up chunk file
      fs.unlinkSync(chunk.path);
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

  logger.info(
    {
      videoId: video.id,
      segmentCount: allSegments.length,
      wordCount: allWords.length,
      language: detectedLanguage,
    },
    "Transcription complete",
  );

  return transcript;
}

interface ChunkInfo {
  path: string;
  offsetSeconds: number;
}

async function splitAudio(
  audioPath: string,
  videoId: string,
  config: PipelineConfig,
): Promise<ChunkInfo[]> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  // Get audio duration
  const { stdout: durationOut } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    audioPath,
  ]);
  const totalDuration = parseFloat(durationOut.trim());

  const chunks: ChunkInfo[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < totalDuration) {
    const chunkPath = path.join(config.tempDir, videoId, `chunk_${chunkIndex}.wav`);
    await execFileAsync("ffmpeg", [
      "-i",
      audioPath,
      "-ss",
      offset.toString(),
      "-t",
      CHUNK_DURATION_SECONDS.toString(),
      "-ar",
      "16000",
      "-ac",
      "1",
      "-f",
      "wav",
      "-y",
      chunkPath,
    ]);
    chunks.push({ path: chunkPath, offsetSeconds: offset });
    offset += CHUNK_DURATION_SECONDS;
    chunkIndex++;
  }

  return chunks;
}

interface TranscribeChunkResult {
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  language: string;
}

async function transcribeChunk(
  openai: OpenAI,
  audioPath: string,
  config: PipelineConfig,
  timeOffset: number,
): Promise<TranscribeChunkResult> {
  const audioFile = fs.createReadStream(audioPath);

  const response = await openai.audio.transcriptions.create({
    file: audioFile,
    model: config.whisperModel,
    response_format: "verbose_json",
    timestamp_granularities: ["segment", "word"],
  });

  const raw = response as any;

  const segments: TranscriptSegment[] = (raw.segments ?? []).map(
    (seg: any) => ({
      start: (seg.start ?? 0) + timeOffset,
      end: (seg.end ?? 0) + timeOffset,
      text: (seg.text ?? "").trim(),
    }),
  );

  const words: TranscriptWord[] = (raw.words ?? []).map((w: any) => ({
    word: (w.word ?? "").trim(),
    start: (w.start ?? 0) + timeOffset,
    end: (w.end ?? 0) + timeOffset,
  }));

  return {
    segments,
    words,
    language: raw.language ?? "pt",
  };
}
