/* v8 ignore start */
import { execFile, type ExecFileOptions } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

export function getYtDlpBaseArgs(config?: PipelineConfig, tempCookieFile?: string): string[] {
  const browser = config?.youtubeCookiesBrowser || process.env.YOUTUBE_COOKIES_BROWSER;
  const file = tempCookieFile || config?.youtubeCookiesFile || process.env.YOUTUBE_COOKIES_FILE;
  const noCookies = config?.youtubeNoCookies || process.env.YOUTUBE_NO_COOKIES === "true" || process.env.NO_COOKIES === "true";

  const args: string[] = [
    "--no-check-certificates",
    "--extractor-args",
    `youtube:player_client=${process.env.YOUTUBE_PLAYER_CLIENT || "default"}`,
    "--js-runtimes",
    "node",
  ];

  if (noCookies) {
    return args;
  }

  if (browser) {
    args.push("--cookies-from-browser", browser);
  } else if (file) {
    args.push("--cookies", file);
  }
  return args;
}

/**
 * Helper to handle temporary cookies from Base64 env var.
 */
export async function withCookies<T>(
  config: PipelineConfig | undefined,
  fn: (cookiePath?: string) => Promise<T>
): Promise<T> {
  const noCookies = config?.youtubeNoCookies || process.env.YOUTUBE_NO_COOKIES === "true" || process.env.NO_COOKIES === "true";
  if (noCookies) {
    return fn(undefined);
  }

  const base64Cookies = config?.youtubeCookiesBase64 || process.env.YOUTUBE_COOKIES_BASE64;
  let tempCookiePath: string | undefined;

  if (base64Cookies) {
    const tempDir = config?.tempDir || path.join(process.cwd(), "output", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    tempCookiePath = path.join(tempDir, `cookies-${crypto.randomBytes(4).toString("hex")}.txt`);
    const cookieBuffer = Buffer.from(base64Cookies, "base64");
    fs.writeFileSync(tempCookiePath, cookieBuffer);

    const stats = fs.statSync(tempCookiePath);
    logger.debug({ path: tempCookiePath, size: stats.size }, "Temporary cookie file created");

    if (stats.size < 10) {
      logger.warn({ size: stats.size }, "Cookie file is suspiciously small, check YOUTUBE_COOKIES_BASE64 helper");
    }
  }

  try {
    return await fn(tempCookiePath);
  } finally {
    if (tempCookiePath && fs.existsSync(tempCookiePath)) {
      try {
        fs.unlinkSync(tempCookiePath);
      } catch (err) {
        logger.warn({ err, path: tempCookiePath }, "Failed to delete temp cookie file");
      }
    }
  }
}

/**
 * Execute yt-dlp with comprehensive error diagnostics.
 */
export async function execYtDlp(args: string[], options: ExecFileOptions = {}): Promise<{ stdout: string; stderr: string }> {
  try {
    const spawnEnv = {
      ...process.env,
      ...(options as { env?: NodeJS.ProcessEnv }).env,
      YTDLP_JS_EXECUTABLE: "node",
    };
    return (await execFileAsync("yt-dlp", args, { ...options, env: spawnEnv, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })) as unknown as {
      stdout: string;
      stderr: string;
    };
  } catch (error: unknown) {
    const stderr = error instanceof Error && "stderr" in error ? String((error as NodeJS.ErrnoException & { stderr?: string }).stderr) : "";

    // Redact cookie path from args if present for extra safety
    const safeArgs = args.map((arg, i) => {
      if (i > 0 && args[i - 1] === "--cookies") return "[REDACTED_COOKIE_PATH]";
      return arg;
    });

    const safeStderr = stderr.replace(/cookies-[a-f0-9]+\.txt/g, "[REDACTED_COOKIE_FILE]");
    const safeMessage = (error instanceof Error ? error.message : String(error)).replace(/cookies-[a-f0-9]+\.txt/g, "[REDACTED_COOKIE_FILE]");

    logger.error({
      args: safeArgs,
      stderr: safeStderr,
      message: safeMessage
    }, "yt-dlp execution failed");
    throw error;
  }
}

/**
 * Diagnose which stage of audio download failed.
 */
export function diagnoseAudioDownloadFailure(stderr: string): string {
  const lower = stderr.toLowerCase();

  if (lower.includes("403") || lower.includes("bot") || lower.includes("blocked")) {
    return "YOUTUBE_BLOCKED";
  }
  if (lower.includes("sign in") || lower.includes("age")) {
    return "YOUTUBE_AUTH_REQUIRED";
  }
  if (lower.includes("no formats found") || lower.includes("no video formats")) {
    return "NO_VIDEO_FORMATS";
  }
  if (lower.includes("unable to download") && lower.includes("http")) {
    return "NETWORK_ERROR_DOWNLOAD";
  }
  if (lower.includes("ffmpeg") || lower.includes("post-processor")) {
    if (lower.includes("not found")) return "FFMPEG_NOT_INSTALLED";
    return "FFMPEG_CONVERSION_FAILED";
  }
  if (lower.includes("no space") || lower.includes("disk full")) {
    return "DISK_SPACE_FULL";
  }
  if (lower.includes("permission denied") || lower.includes("access denied")) {
    return "PERMISSION_ERROR";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "TIMEOUT";
  }

  return "UNKNOWN_ERROR";
}
/* v8 ignore stop */
