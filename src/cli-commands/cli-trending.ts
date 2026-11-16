import { loadConfig } from "../core/config.js";
import { logger } from "../core/logger.js";
import { pickBackgroundMusic } from "../core/audio-ducking.js";
import { ensureAmbientPad } from "../core/trending/ambient-track.js";
import { defaultTrendingDeps, runWeeklyTrendingShort } from "../core/trending/run-weekly.js";
import path from "node:path";

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * `bun run cli generate:trending` — narrates the best trending GitHub repository
 * not yet used (see TRENDING_* env vars). Run it once a week, e.g. from a CronJob.
 * Background music: BGM_FILE/BGM_DIR when set, otherwise a generated ambient pad.
 */
export async function runTrendingCommand(): Promise<void> {
  const config = loadConfig();
  const musicDir = path.join(config.outputDir, "trending");
  const musicPath = pickBackgroundMusic() ?? await ensureAmbientPad(musicDir);
  const { repo, short } = await runWeeklyTrendingShort({
    outputDir: config.outputDir,
    windowDays: intFromEnv("TRENDING_WINDOW_DAYS", 7),
    minStars: intFromEnv("TRENDING_MIN_STARS", 100),
    candidatePool: intFromEnv("TRENDING_CANDIDATES", 15),
    maxImages: intFromEnv("TRENDING_MAX_IMAGES", 6),
    token: process.env.GITHUB_TOKEN || undefined,
    ttsVoice: process.env.COMIC_TTS_VOICE || "pt-BR-AntonioNeural",
    watermarkText: process.env.COMIC_WATERMARK_TEXT || undefined,
    musicPath,
    verticalWidth: config.verticalWidth,
    verticalHeight: config.verticalHeight,
  }, defaultTrendingDeps(config.outputDir));
  logger.info({ repo: repo.fullName, outputPath: short.outputPath }, "generate:trending completed");
  console.log(`Short de ${repo.fullName} gerado: ${short.outputPath} (${short.durationSec.toFixed(1)}s, ${short.chapters} capítulos)`);
}
