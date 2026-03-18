import { config as dotenvConfig } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import type { PipelineConfig } from "../types.js";

dotenvConfig();

export function requiredEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export function loadConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
  const outputDir = path.resolve(optionalEnv("OUTPUT_DIR", "./output"));
  const tempDir = path.resolve(path.join(outputDir, "temp"));

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const channelsRaw = optionalEnv("YOUTUBE_CHANNELS", "");
  const channels = channelsRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const urlsRaw = optionalEnv("VIDEO_URLS", "");
  const specificUrls = urlsRaw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  const maxVideoSizeMb = parseInt(optionalEnv("MAX_VIDEO_SIZE_MB", "500"), 10);

  const config: PipelineConfig = {
    channels,
    specificUrls,
    daysBack: parseInt(optionalEnv("DAYS_BACK", "1"), 10),
    maxCutsPerBlock: 10,
    minuteBlockSize: 20,
    maxShortDuration: parseInt(optionalEnv("MAX_SHORT_DURATION", "59"), 10),
    minShortDuration: parseInt(optionalEnv("MIN_SHORT_DURATION", "15"), 10),
    maxVideoSizeBytes: maxVideoSizeMb * 1024 * 1024,
    minShortsPerVideo: parseInt(optionalEnv("MIN_SHORTS_PER_VIDEO", "1"), 10),
    outputDir,
    tempDir,
    ollamaBaseUrl: optionalEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
    ollamaModel: optionalEnv("OLLAMA_MODEL", "gemma3:1b"),
    ollamaTimeoutMs: parseInt(optionalEnv("OLLAMA_TIMEOUT_MS", "400000"), 10),
    whisperModel: optionalEnv("WHISPER_MODEL", "tiny"),
    telegramBotToken: optionalEnv("TELEGRAM_BOT_TOKEN", ""),
    telegramChatId: optionalEnv("TELEGRAM_CHAT_ID", ""),
    verticalWidth: 1080,
    verticalHeight: 1920,
    youtubeCookiesBrowser: optionalEnv("YOUTUBE_COOKIES_BROWSER", ""),
    youtubeCookiesFile: optionalEnv("YOUTUBE_COOKIES_FILE", ""),
    youtubeCookiesBase64: optionalEnv("YOUTUBE_COOKIES_BASE64", ""),
    watermarkText: optionalEnv("WATERMARK_TEXT", "santidade católica"),
    ...overrides,
  };

  return config;
}

/**
 * Calculate minimum number of cuts allowed for a video based on its duration.
 */
export function getMinCuts(videoDurationSeconds: number): number {
  const durationMinutes = Math.floor(videoDurationSeconds / 60);
  // Rule: 2 cuts per minute minimum, maximum 10 to avoid token limit
  return Math.min(10, Math.max(2, durationMinutes * 2));
}

/**
 * Calculate maximum number of cuts allowed for a video based on its duration.
 */
export function getMaxCuts(videoDurationSeconds: number): number {
  const durationMinutes = Math.floor(videoDurationSeconds / 60);
  const minCuts = getMinCuts(videoDurationSeconds);
  // Rule: Ensure max is at least min. Maximum 15 to avoid token limit.
  return Math.min(15, Math.max(minCuts, durationMinutes * 2));
}
