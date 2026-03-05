import { config as dotenvConfig } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import type { PipelineConfig } from "../types.js";

dotenvConfig();

function requiredEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
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
    minShortsPerVideo: parseInt(optionalEnv("MIN_SHORTS_PER_VIDEO", "2"), 10),
    outputDir,
    tempDir,
    ollamaBaseUrl: optionalEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
    ollamaModel: optionalEnv("OLLAMA_MODEL", "qwen3-vl:4b"),
    whisperModel: optionalEnv("WHISPER_MODEL", "base"),
    telegramBotToken: optionalEnv("TELEGRAM_BOT_TOKEN", ""),
    telegramChatId: optionalEnv("TELEGRAM_CHAT_ID", ""),
    verticalWidth: 1080,
    verticalHeight: 1920,
    youtubeCookiesBrowser: optionalEnv("YOUTUBE_COOKIES_BROWSER", ""),
    youtubeCookiesFile: optionalEnv("YOUTUBE_COOKIES_FILE", ""),
    youtubeCookiesBase64: optionalEnv("YOUTUBE_COOKIES_BASE64", ""),
    ...overrides,
  };

  return config;
}

/**
 * Calculate maximum number of cuts allowed for a video based on its duration.
 * Rule: 10 cuts per 20 minutes of video.
 */
export function getMaxCuts(
  videoDurationSeconds: number,
  cutsPerBlock: number = 10,
  blockSizeMinutes: number = 20,
): number {
  const durationMinutes = videoDurationSeconds / 60;
  const blocks = Math.ceil(durationMinutes / blockSizeMinutes);
  return blocks * cutsPerBlock;
}
