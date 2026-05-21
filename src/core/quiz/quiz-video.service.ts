import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Quiz } from "./quiz.domain.js";
import type { WordTimestamp } from "./quiz-tts.service.js";
import { ensureFont, prepareBackground, prepareTextFiles, normalizePath } from "./quiz-assets.service.js";
import { generateFilters } from "./quiz-filters.service.js";
import { runFFmpeg } from "./quiz-ffmpeg.service.js";
import { logger } from "../logger.js";
import type { PipelineConfig } from "../../types.js";

export const assembleVideo = async (
  quiz: Quiz,
  audioData: { qPath: string; aPath: string; qWords: WordTimestamp[]; aWords: WordTimestamp[] },
  outputPath: string = "final_short.mp4",
  tempDir: string = "temp_assets",
  config: PipelineConfig
): Promise<string> => {
  const resolvedTempDir = path.resolve(tempDir);
  if (!fs.existsSync(resolvedTempDir)) {
    fs.mkdirSync(resolvedTempDir, { recursive: true });
  }

  logger.info("🎬 Montando vídeo de quiz completo...");

  try {
    const fontFile = ensureFont();
    const qPath = normalizePath(audioData.qPath);
    const aPath = normalizePath(audioData.aPath);
    const qDur = parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", qPath]).stdout.toString().trim());
    const aDur = parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", aPath]).stdout.toString().trim());

    const totalSeconds = qDur + aDur + 5;

    const musicDir = path.resolve("assets/music");
    let musicPath = "";
    if (fs.existsSync(musicDir)) {
      const musicFiles = fs.readdirSync(musicDir).filter(f => f.startsWith("background") && f.endsWith(".mp3"));
      if (musicFiles.length > 0) {
        const randomMusic = musicFiles[Math.floor(Math.random() * musicFiles.length)] as string;
        musicPath = normalizePath(path.join("assets/music", randomMusic));
        logger.info(`🎵 Usando música de fundo: ${randomMusic}`);
      }
    }

    const beepPath = normalizePath("assets/music/beep.mp3");
    const logoPath = normalizePath("assets/logo/logo.png");
    const hasMusic = fs.existsSync(musicPath) && musicPath !== "";
    const hasBeep = fs.existsSync(beepPath);
    const hasLogo = fs.existsSync(logoPath);

    const bgVideo = prepareBackground(resolvedTempDir);
    const { qTxtPath, optTxtPaths } = prepareTextFiles(quiz, resolvedTempDir);

    const watermarkText = config.watermarkText || "@akitemquiz";

    const { ffmpegInputs, filterComplex } = generateFilters(
      quiz, bgVideo, qPath, aPath, qDur, fontFile, qTxtPath, optTxtPaths,
      hasMusic, hasBeep, hasLogo, musicPath, beepPath, logoPath, watermarkText
    );

    await runFFmpeg(ffmpegInputs, filterComplex, outputPath, totalSeconds);

    return outputPath;
  } catch (err: any) {
    logger.error({ error: err.message }, "❌ Erro na montagem do vídeo do quiz");
    throw err;
  }
};
