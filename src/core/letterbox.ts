import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegBin } from "./ffmpeg-bin.js";

const execFileAsync = promisify(execFile);

export interface CropBox {
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface LetterboxInfo {
  box: CropBox;
  sourceWidth: number;
}

const MIN_SAVINGS = 0.04;

/** Most frequent `crop=W:H:X:Y` suggestion in cropdetect's log. */
export function parseCropDetect(log: string): CropBox | null {
  const counts = new Map<string, number>();
  for (const match of log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)) {
    counts.set(match.slice(1, 5).join(":"), (counts.get(match.slice(1, 5).join(":")) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!best) return null;
  const [width, height, x, y] = best.split(":").map(Number) as [number, number, number, number];
  return { width, height, x, y };
}

/** Source picture width from ffmpeg's "Stream #0:0 ... Video: h264, yuv420p, 640x480" line. */
export function parseSourceWidth(log: string): number | null {
  const match = log.match(/Video:[^\n]*?[ ,](\d{2,5})x\d{2,5}/);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

/** Maps a speaker position (0..1 of the full frame) into the cropped frame. */
export function focusInBox(position: number, info: LetterboxInfo): number {
  return Math.max(0, Math.min(1, (position * info.sourceWidth - info.box.x) / info.box.width));
}

/**
 * Detects baked-in black bars (letterbox/pillarbox) so the vertical crop frames
 * the real picture. Null when there are no bars worth removing or detection
 * fails; disabled with AUTO_CROP=false.
 */
export async function detectLetterbox(
  inputPath: string,
  startTime: number,
  duration: number,
): Promise<LetterboxInfo | null> {
  if (process.env.AUTO_CROP === "false") return null;
  try {
    const { stderr } = await execFileAsync(ffmpegBin(), [
      "-v", "info", "-ss", String(startTime + Math.min(2, duration / 4)), "-t", "4", "-i", inputPath,
      "-vf", "fps=4,cropdetect=limit=24:round=2:reset=0", "-an", "-f", "null", "-",
    ], { maxBuffer: 16 * 1024 * 1024 });
    const log = String(stderr);
    const box = parseCropDetect(log);
    const sourceWidth = parseSourceWidth(log);
    if (!box || !sourceWidth) return null;
    const sourceHeight = Number.parseInt(log.match(/Video:[^\n]*?[ ,]\d{2,5}x(\d{2,5})/)![1]!, 10);
    const saved = 1 - (box.width * box.height) / (sourceWidth * sourceHeight);
    return saved >= MIN_SAVINGS ? { box, sourceWidth } : null;
  } catch {
    return null;
  }
}
