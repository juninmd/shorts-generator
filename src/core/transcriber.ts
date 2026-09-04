import fs from "node:fs";
import path from "node:path";
import type { Transcript, TranscriptSegment, TranscriptWord, DownloadedVideo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { getAudioChunkDurationSec, splitAudioIntoChunks, mergeWhisperOutputs, cleanupChunkFiles, type WhisperOutput } from "./audio-chunker.js";
import { transcribeRemote } from "./transcriber-api.js";
export * from "./transcriber-api.js";

export async function transcribeVideo(video: DownloadedVideo, config: PipelineConfig): Promise<Transcript> {
  if (!config.whisperBaseUrl) throw new Error("WHISPER_BASE_URL is required; cluster faster-whisper is the only supported transcriber");
  logger.info({ videoId: video.id, title: video.title, baseUrl: config.whisperBaseUrl }, "Starting faster-whisper transcription");
  const outputDir = path.join(config.tempDir, video.id, "whisper_out");
  fs.mkdirSync(outputDir, { recursive: true });
  const onProgress = (config as any).onProgress as ((pct: number) => void) | undefined;
  let raw: WhisperOutput;
  const chunkDurationSec = getAudioChunkDurationSec();

  if (video.duration > chunkDurationSec) {
    const chunkCount = Math.ceil(video.duration / chunkDurationSec);
    logger.info({ videoId: video.id, durationSec: video.duration, chunkDurationSec, chunkCount }, "Audio too long — splitting into chunks");
    const chunks = await splitAudioIntoChunks(video.audioPath, video.duration, chunkDurationSec, outputDir);
    const chunkOutputs: { data: WhisperOutput; offsetSec: number }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const { path: chunkPath, offsetSec } = chunks[i]!;
      logger.info({ videoId: video.id, chunk: i + 1, of: chunks.length, offsetSec }, "Transcribing audio chunk");
      const chunkOnProgress = onProgress ? (pct: number) => onProgress(((i + pct / 100) / chunks.length) * 100) : undefined;
      const data = await transcribeRemote(chunkPath, config, chunkOnProgress);
      chunkOutputs.push({ data, offsetSec });
    }
    cleanupChunkFiles(chunks);
    raw = mergeWhisperOutputs(chunkOutputs);
  } else {
    raw = await transcribeRemote(video.audioPath, config, onProgress);
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
  const allSegments: TranscriptSegment[] = [];
  const allWords: TranscriptWord[] = [];
  for (const seg of raw.segments ?? []) {
    allSegments.push({ start: seg.start ?? 0, end: seg.end ?? 0, text: (seg.text ?? "").trim() });
    for (const w of (seg as any).words ?? []) allWords.push({ word: (w.word ?? "").trim(), start: w.start ?? 0, end: w.end ?? 0 });
  }
  allSegments.sort((a, b) => a.start - b.start);
  allWords.sort((a, b) => a.start - b.start);
  logger.info({ videoId: video.id, segmentCount: allSegments.length, wordCount: allWords.length, language: raw.language }, "Faster-whisper transcription complete");

  return { videoId: video.id, segments: allSegments, words: allWords, fullText: allSegments.map((s) => s.text).join(" "), language: raw.language ?? "pt", duration: video.duration };
}
