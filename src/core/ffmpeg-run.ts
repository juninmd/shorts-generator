import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { buildFontEnv } from "./ffmpeg-env.js";
import { ffmpegBin } from "./ffmpeg-bin.js";

const execFileAsync = promisify(execFile);

/** Default ceiling for one ffmpeg job; a wedged encoder must not hang the queue forever. */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const STDERR_TAIL = 2000;

/**
 * Flags every invocation needs, following ffmpeg-skill's `ffmpeg_base()`:
 * no interactive stdin (a prompt would block the worker) and no banner noise
 * in the log a failure is read from.
 */
export function ffmpegBaseArgs(): string[] {
  return ["-hide_banner", "-nostdin"];
}

/** `FFMPEG_TIMEOUT_MS`; invalid or non-positive values fall back to 30 minutes. */
export function ffmpegTimeoutMs(): number {
  const raw = Number.parseInt(process.env.FFMPEG_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

export interface FfmpegRunOptions {
  /** Partial file removed when the job fails or times out. */
  outputPath?: string;
  maxBufferBytes?: number;
}

export interface FfmpegRunResult {
  stderr: string;
  /** Wall-clock duration of the job, for the log line. */
  durationMs: number;
}

function tail(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.length > STDERR_TAIL ? text.slice(-STDERR_TAIL) : text;
}

/** Human-readable reason for a failed run: timeout, exit status and the end of stderr. */
export function describeFfmpegFailure(error: unknown, timeoutMs: number): string {
  const err = error as { killed?: boolean; code?: number | string; message?: string; stderr?: string };
  if (err.killed) return `FFmpeg was killed after the ${timeoutMs}ms timeout`;
  const exit = typeof err.code === "number" ? ` (exit ${err.code})` : "";
  return `FFmpeg failed${exit}: ${tail(err.stderr) || err.message || "unknown error"}`;
}

function removePartialOutput(outputPath?: string): void {
  if (!outputPath) return;
  try {
    fs.rmSync(outputPath, { force: true });
  } catch {
    // A file we cannot remove is not a reason to lose the real error.
  }
}

/**
 * Run ffmpeg with the shared flags, an env that can find the bundled fonts and
 * a timeout, and never leave a half-written output behind after a crash.
 */
export async function runFfmpeg(args: string[], options: FfmpegRunOptions = {}): Promise<FfmpegRunResult> {
  const bin = ffmpegBin();
  const timeoutMs = ffmpegTimeoutMs();
  const startedAt = Date.now();
  try {
    const { stderr } = await execFileAsync(bin, [...ffmpegBaseArgs(), ...args], {
      env: buildFontEnv(),
      maxBuffer: options.maxBufferBytes ?? 100 * 1024 * 1024,
      timeout: timeoutMs,
      killSignal: "SIGKILL",
    });
    return { stderr: String(stderr ?? ""), durationMs: Date.now() - startedAt };
  } catch (error) {
    removePartialOutput(options.outputPath);
    throw new Error(describeFfmpegFailure(error, timeoutMs));
  }
}
