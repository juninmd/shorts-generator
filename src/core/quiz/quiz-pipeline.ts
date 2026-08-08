import { Bot, InputFile } from "grammy";
import fs from "node:fs";
import path from "node:path";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";
import { generateQuiz } from "./quiz-content.service.js";
import type { Quiz, QuizQuestion } from "./quiz.domain.js";
import { generateNarration } from "./quiz-tts.service.js";
import { assembleVideo } from "./quiz-video.service.js";
import { uploadToYouTube } from "../youtube.service.js";
import { enqueueYoutubeUpload } from "../queue.js";
import { isDailyLimitReachedAsync, incrementDailyUploadCountAsync } from "../state.js";

export const buildRevealNarration = (question: QuizQuestion): string =>
  `Letra ${question.resposta_correta}: ${question.opcoes[question.resposta_correta]}!`;

export const buildOutroNarration = (quiz: Quiz): string =>
  `${quiz.fato_curioso}. Comenta quantas você acertou e se inscreve para o próximo quiz!`;

export const buildTelegramCaption = (quiz: Quiz, watermarkText: string): string =>
  `🏆 <b>${quiz.titulo_youtube}</b>\n\nPrimeira pergunta: ${quiz.perguntas[0]?.pergunta}\n\nCanal: ${watermarkText}\n\n#quiz #shorts`;

export const buildYoutubeRelayCaption = (quiz: Quiz, url: string): string =>
  `📺 <b>O quiz "${quiz.tema.toUpperCase()}" já está no YouTube!</b>\n\nAssista e deixe aquele like: ${url}`;

export const buildOutputFileName = (quiz: Quiz): string => `quiz_${quiz.tema.replace(/\s+/g, "_")}_${Date.now()}.mp4`;

export const buildYoutubeMetadata = (quiz: Quiz, watermarkText: string): { title: string; description: string; tags: string[] } => {
  const slug = quiz.tema.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  return {
    title: quiz.titulo_youtube || `${quiz.perguntas[0]?.pergunta ?? quiz.tema} 🧠`,
    description: `${quiz.hook} Teste seus conhecimentos de ${quiz.tema} em ${quiz.perguntas.length} perguntas — a última quase ninguém acerta.\n` +
      `Comenta quantas você acertou e se inscreve para o próximo!\n\n` +
      `#shorts #quiz #${slug}\n\nCanal: ${watermarkText}`,
    tags: [...(quiz.tags || []), quiz.tema, "quiz"],
  };
};

export const runQuizPipeline = async (
  config: PipelineConfig,
  onProgress?: (progress: { stage: string; progress: number; message: string }) => void | Promise<void>,
  quizTopic?: string
): Promise<any> => {
  logger.info({ quizTopic }, "🚀 Iniciando Pipeline de Quiz Shorts");

  // Step 1: Content Generation
  await onProgress?.({ stage: "generating_quiz", progress: 10, message: "Gerando perguntas do quiz usando IA..." });
  const quiz = await generateQuiz(config, quizTopic);
  logger.info({ quiz }, "Quiz gerado com sucesso");

  const jobId = `quiz-${Date.now()}`;
  const jobWorkspace = path.join(config.tempDir, jobId);
  fs.mkdirSync(jobWorkspace, { recursive: true });

  const watermarkText = config.watermarkText || "@akitemquiz";
  const outputFileName = buildOutputFileName(quiz);
  const outputPath = path.join(config.outputDir, outputFileName);

  try {
    // Step 2: Speech Generation (TTS) — one narration per question/reveal + outro
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

    // Step 3: Video Rendering (FFmpeg assembly)
    await onProgress?.({ stage: "rendering", progress: 60, message: "Montando e renderizando vídeo via FFmpeg..." });
    await assembleVideo(
      quiz,
      { questionAudioPaths, answerAudioPaths, outroAudioPath: outro.audioPath },
      outputPath,
      jobWorkspace,
      config
    );

    // Step 4: Publish to Telegram
    let telegramSent = false;
    if (config.telegramBotToken && config.telegramChatId) {
      await onProgress?.({ stage: "publishing_telegram", progress: 80, message: "Publicando vídeo no Telegram..." });
      try {
        const bot = new Bot(config.telegramBotToken);
        const caption = buildTelegramCaption(quiz, watermarkText);
        await bot.api.sendVideo(config.telegramChatId, new InputFile(outputPath), {
          caption: `🎬 <b>NOVO QUIZ GERADO</b>\n` +
                   `──────────────────────\n` +
                   `${caption}\n\n` +
                   `──────────────────────\n` +
                   `<i>Quiz Shorts Generator AI</i>`,
          supports_streaming: true,
          parse_mode: "HTML",
        });
        telegramSent = true;
        logger.info("✅ Vídeo enviado ao Telegram com sucesso");
      } catch (err: any) {
        logger.error({ error: err.message }, "❌ Erro ao enviar vídeo para o Telegram");
      }
    }

    // Step 5: Publish to YouTube Shorts
    let youtubeUrl: string | null = null;
    const enableYouTube = process.env.ENABLE_YOUTUBE === "true";
    if (enableYouTube) {
      await onProgress?.({ stage: "publishing_youtube", progress: 90, message: "Fazendo upload para o YouTube Shorts..." });
      const meta = buildYoutubeMetadata(quiz, watermarkText);
      const channelId = config.managedRun?.channelId || "global";
      if (await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
        logger.warn({ channelId }, "⚠️ Limite diário atingido — enfileirando quiz para o PVC");
        await enqueueYoutubeUpload({ id: jobId, outputPath }, meta.title, meta.description, config, meta.tags);
      } else {
        youtubeUrl = await uploadToYouTube(outputPath, meta.title, meta.description, config, meta.tags);
        if (youtubeUrl) {
          await incrementDailyUploadCountAsync(channelId);
        } else {
          logger.warn({ jobId }, "Upload do quiz falhou — enfileirando para retry (acumulado no PVC)");
          await enqueueYoutubeUpload({ id: jobId, outputPath }, meta.title, meta.description, config, meta.tags);
        }
      }
      if (youtubeUrl && config.telegramBotToken && config.telegramChatId) {
        try {
          const bot = new Bot(config.telegramBotToken);
          await bot.api.sendMessage(config.telegramChatId, buildYoutubeRelayCaption(quiz, youtubeUrl), {
            parse_mode: "HTML",
          });
        } catch (err: any) {
          logger.error({ error: err.message }, "❌ Erro ao enviar link do YouTube para o Telegram");
        }
      }
    }

    // Cleanup
    if (!config.keepTempFiles) {
      fs.rmSync(jobWorkspace, { recursive: true, force: true });
    }

    await onProgress?.({ stage: "done", progress: 100, message: "Pipeline de Quiz finalizada com sucesso!" });

    return {
      success: true,
      quiz,
      outputPath,
      telegramSent,
      youtubeUrl,
    };
  } catch (error: any) {
    logger.error({ error: String(error) }, "❌ Falha crítica no pipeline do quiz");
    // Cleanup workspace on failure
    try {
      fs.rmSync(jobWorkspace, { recursive: true, force: true });
    } catch {}
    throw error;
  }
};
