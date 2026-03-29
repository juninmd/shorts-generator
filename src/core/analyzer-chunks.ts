/* v8 ignore start */
import { generateObject } from "ai";
import type { Transcript, TranscriptSegment, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { createModel } from "./ai-provider.js";
import { ClipSchema, type ClipItem } from "./analyzer-schema.js";

export const CHUNK_THRESHOLD_CHARS = 32_000;

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function formatTranscriptForLLM(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => `[${formatTime(seg.start)}-${formatTime(seg.end)}] ${seg.text}`)
    .join("\n");
}

export function splitIntoChunks(
  segments: TranscriptSegment[],
  thresholdChars: number,
  overlapCount = 2,
): TranscriptSegment[][] {
  const chunks: TranscriptSegment[][] = [];
  let currentChunk: TranscriptSegment[] = [];
  let currentChars = 0;

  for (const seg of segments) {
    const segLen = `[${formatTime(seg.start)}-${formatTime(seg.end)}] ${seg.text}\n`.length;

    if (currentChars + segLen > thresholdChars && currentChunk.length > 0) {
      chunks.push(currentChunk);
      const overlap = currentChunk.slice(-overlapCount);
      currentChunk = [...overlap];
      currentChars = overlap.reduce(
        (n, s) => n + `[${formatTime(s.start)}-${formatTime(s.end)}] ${s.text}\n`.length,
        0,
      );
    }

    currentChunk.push(seg);
    currentChars += segLen;
  }

  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

export function deduplicateClips(allClips: ClipItem[]): ClipItem[] {
  const sorted = [...allClips].sort((a, b) => b.viralScore - a.viralScore);
  const kept: ClipItem[] = [];

  for (const candidate of sorted) {
    const overlaps = kept.some(
      (existing) =>
        candidate.startTime < existing.endTime && candidate.endTime > existing.startTime,
    );
    if (!overlaps) kept.push(candidate);
  }

  return kept;
}

export async function analyzeInChunks(
  transcript: Transcript,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  minCuts: number,
  maxCuts: number,
  analyzeSinglePass: (
    formatted: string,
    videoTitle: string,
    channelName: string,
    config: PipelineConfig,
    minCuts: number,
    maxCuts: number,
  ) => Promise<ClipItem[]>,
): Promise<ClipItem[]> {
  const chunks = splitIntoChunks(transcript.segments, CHUNK_THRESHOLD_CHARS);

  logger.info(
    { videoId: transcript.videoId, chunkCount: chunks.length, totalSegments: transcript.segments.length },
    "📦 Transcrição grande — analisando em chunks",
  );

  const allClips: ClipItem[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkSegments = chunks[i];
    const fraction = chunkSegments.length / transcript.segments.length;
    const chunkMin = Math.max(1, Math.round(minCuts * fraction));
    const chunkMax = Math.max(chunkMin + 1, Math.round(maxCuts * fraction));
    const formatted = formatTranscriptForLLM(chunkSegments);

    logger.info(
      { chunk: i + 1, of: chunks.length, segments: chunkSegments.length, chars: formatted.length },
      "🔍 Analisando chunk",
    );

    const clips = await analyzeSinglePass(formatted, videoTitle, channelName, config, chunkMin, chunkMax);
    allClips.push(...clips);
  }

  return deduplicateClips(allClips);
}

export { ClipSchema, type ClipItem };
/* v8 ignore stop */
