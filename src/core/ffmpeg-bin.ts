import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** ffmpeg binary; override with FFMPEG_PATH. */
export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

/** ffprobe binary; override with FFPROBE_PATH. */
export function ffprobeBin(): string {
  return process.env.FFPROBE_PATH || "ffprobe";
}

export interface ProbedFormat {
  duration?: string;
  start_time?: string;
}

/** Read container-level metadata (duration, start_time) via ffprobe. */
export async function probeFormat(filePath: string): Promise<ProbedFormat> {
  const { stdout } = await execFileAsync(
    ffprobeBin(),
    ["-v", "error", "-show_entries", "format=duration,start_time", "-of", "json", filePath],
    { maxBuffer: 1024 * 1024 },
  );
  return (JSON.parse(stdout) as { format?: ProbedFormat }).format ?? {};
}
