import { config as dotenvConfig } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import type { PipelineConfig } from "../types.js";

dotenvConfig({ override: true });

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

  const channelsRaw = optionalEnv("YOUTUBE_CHANNELS", "").replace(/^"(.*)"$/, '$1');
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
  const skipVideoSizeCheck = optionalEnv("SKIP_VIDEO_SIZE_CHECK", "false") === "true";
  const keepTempFiles = optionalEnv("KEEP_TEMP_FILES", "false") === "true";
  const dailyUploadLimit = parseInt(optionalEnv("MAX_DAILY_UPLOADS", "70"), 10);
  const maxVideoDurationMinutes = optionalEnv("MAX_VIDEO_DURATION_MINUTES", "");
  const maxVideoDurationSec = maxVideoDurationMinutes
    ? parseFloat(maxVideoDurationMinutes) * 60
    : parseFloat(optionalEnv("MAX_VIDEO_DURATION_HOURS", "1")) * 3600;
  const videoQuery = optionalEnv("VIDEO_QUERY", "") || undefined;

  const config: PipelineConfig = {
    channels,
    specificUrls,
    videoLimit: parseInt(optionalEnv("VIDEO_LIMIT", "1"), 10),
    maxCutsPerBlock: 10,
    minuteBlockSize: 20,
    maxShortDuration: Math.min(59, parseInt(optionalEnv("MAX_SHORT_DURATION", "59"), 10)),
    minShortDuration: parseInt(optionalEnv("MIN_SHORT_DURATION", "15"), 10),
    maxVideoSizeBytes: maxVideoSizeMb * 1024 * 1024,
    skipVideoSizeCheck,
    keepTempFiles,
    dailyUploadLimit,
    maxVideoDurationSec,
    videoQuery,
    minShortsPerVideo: parseInt(optionalEnv("MIN_SHORTS_PER_VIDEO", "1"), 10),
    targetShorts: Number(optionalEnv("TARGET_SHORTS", "0")) || undefined,
    fullVideoCount: Number(optionalEnv("FULL_VIDEO_COUNT", "0")) || undefined,
    outputDir,
    tempDir,
    aiModel: optionalEnv("AI_MODEL", "cloud/gemma3"),
    aiTimeoutMs: parseInt(optionalEnv("AI_TIMEOUT_MS", "600000"), 10),
    litellmApiKey: optionalEnv("LITELLM_KEY", optionalEnv("OPENAI_API_KEY", "")),
    litellmBaseUrl: optionalEnv("LITELLM_BASE_URL", optionalEnv("OPENAI_BASE_URL", "http://localhost:4000/v1")),
    whisperBaseUrl: optionalEnv("WHISPER_BASE_URL", ""),
    telegramBotToken: optionalEnv("TELEGRAM_BOT_TOKEN", ""),
    telegramChatId: optionalEnv("TELEGRAM_CHAT_ID", ""),
    verticalWidth: 1080,
    verticalHeight: 1920,
    youtubeCookiesBrowser: optionalEnv("YOUTUBE_COOKIES_BROWSER", ""),
    youtubeCookiesFile: optionalEnv("YOUTUBE_COOKIES_FILE", ""),
    youtubeCookiesBase64: optionalEnv("YOUTUBE_COOKIES_BASE64", ""),
    watermarkText: optionalEnv("WATERMARK_TEXT", "santidade católica"),
    videoEncoder: optionalEnv("VIDEO_ENCODER", "libx264"),
    serverPublicUrl: optionalEnv("SERVER_PUBLIC_URL", "") || undefined,
    ...overrides,
  };

  return config;
}

/**
 * Calculate minimum number of cuts allowed for a video based on its duration.
 */
export function getMinCuts(videoDurationSeconds: number): number {
  const durationMinutes = Math.floor(videoDurationSeconds / 60);
  // Rule: 1 cut every 5 minutes, minimum 1, maximum 5
  return Math.min(5, Math.max(1, Math.floor(durationMinutes / 5)));
}

/**
 * Calculate maximum number of cuts allowed for a video based on its duration.
 */
export function getMaxCuts(videoDurationSeconds: number): number {
  const durationMinutes = Math.floor(videoDurationSeconds / 60);
  const minCuts = getMinCuts(videoDurationSeconds);
  // Ceiling is configurable (MAX_CLIPS_PER_VIDEO) to scale output; defaults to 20.
  const ceiling = parseInt(process.env.MAX_CLIPS_PER_VIDEO || "20", 10);
  // Rule: 1 cut every 2 minutes, at least minCuts + 1, capped at ceiling
  return Math.min(ceiling, Math.max(minCuts + 1, Math.floor(durationMinutes / 2)));
}
