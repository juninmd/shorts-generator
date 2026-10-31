import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildTimeline, type Quiz } from "./quiz.domain.js";
import { resolveQuizFont, prepareTextFiles, normalizePath } from "./quiz-assets.service.js";
import { prepareQuizBackground } from "./quiz-background.js";
import { generateFilters } from "./quiz-filters.service.js";
import { runFFmpeg } from "./quiz-ffmpeg.service.js";
import { logger } from "../logger.js";
import { finishDelivery } from "../short-delivery.js";
import { DELIVERY_SPECS } from "../delivery-spec.js";
import { ffprobeBin } from "../ffmpeg-bin.js";
import type { PipelineConfig } from "../../types.js";

export interface QuizNarrations {
  questionAudioPaths: string[];
  answerAudioPaths: string[];
  outroAudioPath: string;
}

const probeDuration = (audioPath: string): number => {
  const out = spawnSync(ffprobeBin(), [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", normalizePath(audioPath),
  ]).stdout.toString().trim();
  const dur = parseFloat(out);
  if (!Number.isFinite(dur) || dur <= 0) {
    throw new Error(`ffprobe não conseguiu medir a duração de ${audioPath}`);
  }
  return dur;
};

export const assembleVideo = async (
  quiz: Quiz,
  narrations: QuizNarrations,
  outputPath: string = "final_short.mp4",
  tempDir: string = "temp_assets",
  config: PipelineConfig
): Promise<string> => {
  const resolvedTempDir = path.resolve(tempDir);
  if (!fs.existsSync(resolvedTempDir)) {
    fs.mkdirSync(resolvedTempDir, { recursive: true });
  }

  logger.info({ questions: quiz.perguntas.length }, "🎬 Montando vídeo de quiz multi-pergunta...");

  try {
    const fontFile = resolveQuizFont();
    const questionDurs = narrations.questionAudioPaths.map(probeDuration);
    const answerDurs = narrations.answerAudioPaths.map(probeDuration);
    const outroDur = probeDuration(narrations.outroAudioPath);
    const timeline = buildTimeline(questionDurs, answerDurs, outroDur);
    logger.info({ total: timeline.total.toFixed(1) }, "Timeline do quiz calculada");

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

    const background = prepareQuizBackground(resolvedTempDir, timeline.total);
    const { questions: textFiles, outroTxtPath,
      outroLinePaths, hookTxtPath } = prepareTextFiles(quiz, resolvedTempDir);

    const { ffmpegInputs, filterComplex } = generateFilters(quiz, timeline, {
      bgVideo: background.path,
      bgIsImage: background.kind === "image",
      bgHasPanel: background.hasPanel,
      questionAudioPaths: narrations.questionAudioPaths.map(normalizePath),
      answerAudioPaths: narrations.answerAudioPaths.map(normalizePath),
      outroAudioPath: normalizePath(narrations.outroAudioPath),
      fontFile,
      textFiles,
      outroTxtPath,
      outroLinePaths,
      hookTxtPath,
      hasMusic: fs.existsSync(musicPath) && musicPath !== "",
      hasBeep: fs.existsSync(beepPath),
      hasLogo: fs.existsSync(logoPath),
      musicPath,
      beepPath,
      logoPath,
      watermarkText: config.watermarkText || "@akitemquiz",
    });

    await runFFmpeg(ffmpegInputs, filterComplex, outputPath, timeline.total);

    // The quiz is uploaded like any other short: same loudness target, same
    // delivery gate (frame, codecs, 48 kHz, no length cap for a long quiz).
    await finishDelivery(outputPath, {
      duration: timeline.total,
      width: DELIVERY_SPECS.custom!.width,
      height: DELIVERY_SPECS.custom!.height,
    }, DELIVERY_SPECS.custom);

    return outputPath;
  } catch (err: any) {
    logger.error({ error: err.message }, "❌ Erro na montagem do vídeo do quiz");
    throw err;
  }
};
