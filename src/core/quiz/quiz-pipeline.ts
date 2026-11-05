import fs from "node:fs";
import path from "node:path";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";
import { DEFAULT_EDITORIAL_PROFILE } from "../editorial/editorial-profile.js";
import { recordEditorialDecision } from "../editorial/editorial-decisions.js";
import type { Quiz } from "./quiz.domain.js";
import { generateNarration } from "./quiz-tts.service.js";
import { assembleVideo } from "./quiz-video.service.js";
import { buildOutputFileName, buildOutroNarration, buildRevealNarration } from "./quiz-copy.js";
import { prepareVerifiedQuiz, type QuizSourcingDeps } from "./quiz-sourcing.js";
import { publishQuizToYoutube, sendQuizToTelegram } from "./quiz-publish.js";

export * from "./quiz-copy.js";

export interface QuizPipelineResult {
  success: boolean;
  /** held = validation/verification failed (nothing rendered); review = rendered, waiting for a human. */
  outcome: "published" | "publish_pending" | "generated" | "review_pending" | "held";
  quiz?: Quiz;
  outputPath?: string;
  telegramSent: boolean;
  youtubeUrl: string | null;
  reasons: string[];
  provenance: string[];
}

type Progress = (progress: { stage: string; progress: number; message: string }) => void | Promise<void>;

export const runQuizPipeline = async (
  config: PipelineConfig,
  onProgress?: Progress,
  quizTopic?: string,
  sourcing: QuizSourcingDeps = {},
): Promise<QuizPipelineResult> => {
  logger.info({ quizTopic }, "🚀 Iniciando Pipeline de Quiz Shorts");
  await onProgress?.({ stage: "generating_quiz", progress: 10, message: "Gerando e verificando perguntas do quiz..." });
  const prepared = await prepareVerifiedQuiz(config, quizTopic, sourcing);
  const channelId = config.managedRun?.channelId ?? "global";
  if (prepared.status === "held") {
    await recordEditorialDecision({ runId: config.managedRun?.runId, channelId, title: prepared.quiz?.titulo_youtube ?? quizTopic ?? "quiz", stage: "quiz_validation", decision: "rejected", reasons: prepared.reasons });
    logger.warn({ reasons: prepared.reasons }, "Quiz retido antes de TTS/render: validação ou verificação falhou");
    await onProgress?.({ stage: "done", progress: 100, message: "Quiz retido para revisão (sem render)" });
    return { success: false, outcome: "held", quiz: prepared.quiz, telegramSent: false, youtubeUrl: null, reasons: prepared.reasons, provenance: [] };
  }
  const { quiz, provenance } = prepared;
  const jobId = `quiz-${Date.now()}`;
  const jobWorkspace = path.join(config.tempDir, jobId);
  fs.mkdirSync(jobWorkspace, { recursive: true });
  const watermarkText = config.watermarkText || "@akitemquiz";
  const outputPath = path.join(config.outputDir, buildOutputFileName(quiz));

  try {
    await onProgress?.({ stage: "generating_tts", progress: 30, message: "Gerando narração via Text-to-Speech..." });
    const narrationJobs = quiz.perguntas.flatMap((question, i) => [
      generateNarration(question.pergunta, `question_${i}`, jobWorkspace),
      generateNarration(buildRevealNarration(question), `answer_${i}`, jobWorkspace),
    ]);
    narrationJobs.push(generateNarration(buildOutroNarration(quiz), "outro", jobWorkspace));
    const results = await Promise.all(narrationJobs);
    const outro = results.pop()!;
    const questionAudioPaths = results.filter((_, idx) => idx % 2 === 0).map((r) => r.audioPath);
    const answerAudioPaths = results.filter((_, idx) => idx % 2 === 1).map((r) => r.audioPath);

    await onProgress?.({ stage: "rendering", progress: 60, message: "Montando e renderizando vídeo via FFmpeg..." });
    await assembleVideo(quiz, { questionAudioPaths, answerAudioPaths, outroAudioPath: outro.audioPath }, outputPath, jobWorkspace, config);

    await onProgress?.({ stage: "publishing_telegram", progress: 80, message: "Publicando vídeo no Telegram..." });
    const telegramSent = await sendQuizToTelegram(quiz, outputPath, config, watermarkText);

    let youtubeUrl: string | null = null;
    let outcome: QuizPipelineResult["outcome"] = "generated";
    const reviewMode = (config.managedRun?.editorial ?? DEFAULT_EDITORIAL_PROFILE).publishMode === "review";
    if (process.env.ENABLE_YOUTUBE === "true" && reviewMode) {
      outcome = "review_pending";
      logger.info({ outputPath }, "Canal em modo revisão: quiz renderizado e retido sem upload");
    } else if (process.env.ENABLE_YOUTUBE === "true") {
      await onProgress?.({ stage: "publishing_youtube", progress: 90, message: "Fazendo upload para o YouTube Shorts..." });
      youtubeUrl = await publishQuizToYoutube(quiz, outputPath, jobId, config, watermarkText, provenance);
      outcome = youtubeUrl ? "published" : "publish_pending";
    }

    if (!config.keepTempFiles) fs.rmSync(jobWorkspace, { recursive: true, force: true });
    await onProgress?.({ stage: "done", progress: 100, message: "Pipeline de Quiz finalizada com sucesso!" });
    return { success: true, outcome, quiz, outputPath, telegramSent, youtubeUrl, reasons: [], provenance };
  } catch (error: any) {
    logger.error({ error: String(error) }, "❌ Falha crítica no pipeline do quiz");
    try {
      fs.rmSync(jobWorkspace, { recursive: true, force: true });
    } catch {}
    throw error;
  }
};
