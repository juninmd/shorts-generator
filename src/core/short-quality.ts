interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
}

export interface ShortProbeMetadata {
  format?: { duration?: string | number };
  streams?: ProbeStream[];
}

interface ExpectedShortMedia {
  duration: number;
  width: number;
  height: number;
}

export async function assertShortMediaQuality(
  filePath: string,
  expected: ExpectedShortMedia,
): Promise<void> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
    "-of", "json",
    filePath,
  ], { maxBuffer: 1024 * 1024 });
  const metadata = JSON.parse(stdout) as ShortProbeMetadata;
  validateShortMetadata(metadata, expected);
}

export function validateShortMetadata(
  metadata: ShortProbeMetadata,
  expected: ExpectedShortMedia,
): void {
  const video = metadata.streams?.find((stream) => stream.codec_type === "video");
  if (video?.width !== expected.width || video.height !== expected.height) {
    throw new Error(
      `Short media quality failed: resolution ${video?.width ?? 0}x${video?.height ?? 0}; `
      + `expected ${expected.width}x${expected.height}`,
    );
  }
  if (video.codec_name !== "h264") {
    throw new Error(
      `Short media quality failed: video codec ${video.codec_name ?? "missing"}; expected h264`,
    );
  }
  const [rateNumerator, rateDenominator = "1"] = (video.r_frame_rate ?? "").split("/");
  const frameRate = Number(rateNumerator) / Number(rateDenominator);
  if (!Number.isFinite(frameRate) || frameRate < 29 || frameRate > 31) {
    throw new Error(
      `Short media quality failed: frame rate ${frameRate.toFixed(3)}fps; expected 29-31fps`,
    );
  }
  const audio = metadata.streams?.find((stream) => stream.codec_type === "audio");
  if (!audio) {
    throw new Error("Short media quality failed: audio stream missing");
  }
  if (audio.codec_name !== "aac") {
    throw new Error(
      `Short media quality failed: audio codec ${audio.codec_name ?? "missing"}; expected aac`,
    );
  }
  const duration = Number(metadata.format?.duration);
  if (!Number.isFinite(duration) || Math.abs(duration - expected.duration) > 0.35) {
    throw new Error(
      `Short media quality failed: duration ${duration.toFixed(3)}s; `
      + `expected ${expected.duration.toFixed(3)}s`,
    );
  }
}
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
