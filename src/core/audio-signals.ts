import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegBin } from "./ffmpeg-bin.js";

const execFileAsync = promisify(execFile);
const MAX_BONUS = 0.5;
const PEAK_SPAN_SECONDS = 20;

/** Speech loudness per second of the source audio (dBFS RMS; silence is -Infinity-ish, floored at -90). */
export interface AudioSignals {
  rmsPerSecond: number[];
}

/** Parses ffmpeg `ametadata=print` output into per-window RMS levels. */
export function parseRmsLevels(output: string): number[] {
  return [...output.matchAll(/lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+|-?inf)/g)]
    .map((match) => Math.max(-90, Number.parseFloat(match[1]!.replace("inf", "Infinity")) || -90));
}

/** Per-second RMS loudness of an audio/video file; best-effort (null when ffmpeg fails). */
export async function computeAudioSignals(inputPath: string): Promise<AudioSignals | null> {
  try {
    const { stdout } = await execFileAsync(ffmpegBin(), [
      "-v", "error", "-i", inputPath, "-vn",
      "-af", "aresample=16000,asetnsamples=n=16000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
      "-f", "null", "-",
    ], { maxBuffer: 64 * 1024 * 1024 });
    const rmsPerSecond = parseRmsLevels(String(stdout));
    return rmsPerSecond.length > 0 ? { rmsPerSecond } : null;
  } catch {
    return null;
  }
}

function meanRms(levels: number[]): number {
  return levels.reduce((sum, level) => sum + level, 0) / Math.max(1, levels.length);
}

/** 0..MAX_BONUS: how much louder (more animated delivery) a span is than the whole video's speech. */
export function energyBonus(start: number, end: number, signals: AudioSignals): number {
  const span = signals.rmsPerSecond.slice(Math.floor(start), Math.ceil(end));
  const voiced = signals.rmsPerSecond.filter((level) => level > -60);
  if (span.length === 0 || voiced.length === 0) return 0;
  const lift = meanRms(span.filter((level) => level > -60)) - meanRms(voiced);
  return Math.max(0, Math.min(MAX_BONUS, lift / 6 * MAX_BONUS));
}

const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Prompt block naming the most energetic spans so the LLM weighs delivery, not only words. */
export function buildEnergyHint(signals: AudioSignals, count = 4): string {
  const levels = signals.rmsPerSecond;
  const spans = Array.from({ length: Math.max(0, levels.length - PEAK_SPAN_SECONDS + 1) }, (_, start) => ({
    start,
    score: meanRms(levels.slice(start, start + PEAK_SPAN_SECONDS)),
  })).sort((a, b) => b.score - a.score);
  const picked: number[] = [];
  for (const span of spans) {
    if (picked.length >= count) break;
    if (picked.every((other) => Math.abs(other - span.start) >= PEAK_SPAN_SECONDS)) picked.push(span.start);
  }
  if (picked.length === 0) return "";
  const list = picked.sort((a, b) => a - b)
    .map((start) => `${clock(start)}-${clock(start + PEAK_SPAN_SECONDS)}`).join(", ");
  return `SINAIS DE ÁUDIO: a fala é mais intensa/animada em ${list}. Prefira cortes nesses trechos quando o conteúdo também for forte.\n`;
}
