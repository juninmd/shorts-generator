import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegTimeoutMs } from "./ffmpeg-timeout.js";

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
    { maxBuffer: 1024 * 1024, timeout: ffmpegTimeoutMs(), killSignal: "SIGKILL" },
  );
  return (JSON.parse(stdout) as { format?: ProbedFormat }).format ?? {};
}

export interface ProbedVideoStream {
  codec_name?: string;
  width?: number;
  height?: number;
  color_space?: string;
  color_transfer?: string;
  color_primaries?: string;
}

/**
 * Colour and geometry of the source picture. The vertical render tags its
 * output BT.709, so the source matrix decides whether the pixels must be
 * converted (a BT.601 source) or only relabelled. Best-effort: {} on failure.
 */
export async function probeVideoStream(filePath: string): Promise<ProbedVideoStream> {
  try {
    const { stdout } = await execFileAsync(
      ffprobeBin(),
      [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,color_space,color_transfer,color_primaries",
        "-of", "json", filePath,
      ],
      { maxBuffer: 1024 * 1024, timeout: ffmpegTimeoutMs(), killSignal: "SIGKILL" },
    );
    const streams = (JSON.parse(stdout) as { streams?: ProbedVideoStream[] }).streams ?? [];
    return streams[0] ?? {};
  } catch {
    return {};
  }
}
