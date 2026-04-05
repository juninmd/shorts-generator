/* v8 ignore start */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

/**
 * Get the base arguments for yt-dlp.
 */
export function getYtDlpBaseArgs(config?: PipelineConfig, tempCookieFile?: string): string[] {
  const browser = config?.youtubeCookiesBrowser || process.env.YOUTUBE_COOKIES_BROWSER;
  const file = tempCookieFile || config?.youtubeCookiesFile || process.env.YOUTUBE_COOKIES_FILE;

  const args: string[] = [
    "--no-check-certificates",
    "--extractor-args",
    "youtube:player_client=tv,android,web",
    "--js-runtimes",
    "node",
  ];

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
 * Execute yt-dlp with better error reporting.
 */
export async function execYtDlp(args: string[], options: any = {}): Promise<{ stdout: string; stderr: string }> {
  try {
    const spawnEnv = {
      ...process.env,
      ...options.env,
      YTDLP_JS_EXECUTABLE: "node", // Force yt-dlp to use Node.js for EJS challenges
    };
    return (await execFileAsync("yt-dlp", args, { ...options, env: spawnEnv, encoding: "utf8" })) as unknown as {
      stdout: string;
      stderr: string;
    };
  } catch (error: any) {
    const stderr = error.stderr || "";
    // Redact cookie path from args if present for extra safety
    const safeArgs = args.map((arg, i) => {
      if (i > 0 && args[i - 1] === "--cookies") return "[REDACTED_COOKIE_PATH]";
      return arg;
    });

    const safeMessage = (error.message || "").replace(/cookies-[a-f0-9]+\.txt/g, "[REDACTED_COOKIE_FILE]");

    logger.error({
      args: safeArgs,
      stderr: stderr.split("\n").filter((l: string) => {
        const lower = l.toLowerCase();
        return lower.includes("error") || lower.includes("warning");
      }).join("\n"),
      message: safeMessage
    }, "yt-dlp execution failed");
    throw error;
  }
}
/* v8 ignore stop */
