
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

export const AUDIO_CHUNK_DURATION_SEC = 5 * 60; // 5 minutes per chunk

interface WhisperWord { word: string; start: number; end: number; probability?: number }
interface WhisperSegment { start: number; end: number; text: string; words?: WhisperWord[] }
export interface WhisperOutput { text: string; language: string; segments: WhisperSegment[] }

/**
 * Split audio file into fixed-duration chunks using ffmpeg.
 * Returns chunk file paths with their start offset in the original audio (seconds).
 * Timestamps from whisper on each chunk are relative to the chunk start —
 * add `offsetSec` to each segment/word to recover the original video timestamps.
 */
export async function splitAudioIntoChunks(
  audioPath: string,
  totalDurationSec: number,
  chunkDurationSec: number,
  outputDir: string,
): Promise<{ path: string; offsetSec: number }[]> {
  const chunks: { path: string; offsetSec: number }[] = [];
  const ext = path.extname(audioPath);

  for (let offsetSec = 0; offsetSec < totalDurationSec; offsetSec += chunkDurationSec) {
    const idx = Math.floor(offsetSec / chunkDurationSec);
    const chunkPath = path.join(outputDir, `chunk_${String(idx).padStart(3, "0")}${ext}`);
    const duration = Math.min(chunkDurationSec, totalDurationSec - offsetSec);

    await execFileAsync("ffmpeg", [
      "-y", "-i", audioPath,
      "-ss", String(offsetSec),
      "-t", String(duration),
      "-c", "copy",
      chunkPath,
    ], { timeout: 120_000 });

    chunks.push({ path: chunkPath, offsetSec });
  }

  return chunks;
}

/**
 * Merge whisper JSON outputs from multiple chunks back into a single transcript.
 * Adjusts all segment and word timestamps by each chunk's offsetSec so they
 * reflect positions in the original video, not the individual chunk files.
 */
export function mergeWhisperOutputs(chunks: { data: WhisperOutput; offsetSec: number }[]): WhisperOutput {
  const merged: WhisperOutput = {
    text: "",
    language: chunks[0]?.data.language ?? "pt",
    segments: [],
  };

  for (const { data, offsetSec } of chunks) {
    for (const seg of data.segments ?? []) {
      merged.segments.push({
        start: seg.start + offsetSec,
        end: seg.end + offsetSec,
        text: seg.text,
        words: seg.words?.map((w) => ({
          ...w,
          start: w.start + offsetSec,
          end: w.end + offsetSec,
        })),
      });
    }
    merged.text += data.text;
  }

  return merged;
}

export function cleanupChunkFiles(chunks: { path: string }[]): void {
  for (const { path: p } of chunks) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
}
