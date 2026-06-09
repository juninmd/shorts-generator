import { Bot, InputFile } from "grammy";
import fs from "node:fs";
import path from "node:path";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";
import { generateQuiz } from "./quiz-content.service.js";
import type { Quiz } from "./quiz.domain.js";
import { generateNarration } from "./quiz-tts.service.js";
import { assembleVideo } from "./quiz-video.service.js";
import { uploadToYouTube } from "../youtube.service.js";

export const buildAnswerNarration = (quiz: Quiz): string =>
  `A resposta correta é a letra ${quiz.resposta_correta}: ${quiz.opcoes[quiz.resposta_correta]}. ${quiz.fato_curioso}. E aí, você sabia? Se gostou da curiosidade, curta o vídeo e se inscreva no canal para mais vídeos como este!`;

export const buildTelegramCaption = (quiz: Quiz, watermarkText: string): string =>
  `🏆 <b>NOVO QUIZ: ${quiz.tema.toUpperCase()}!</b>\n\nPerguntamos: ${quiz.pergunta}\n\nCanal: ${watermarkText}\n\n#quiz #shorts #gerado_ia`;

export const buildYoutubeRelayCaption = (quiz: Quiz, url: string): string =>
  `📺 <b>O vídeo do quiz "${quiz.tema.toUpperCase()}" também já está no YouTube!</b>\n\nAssista e deixe aquele like: ${url}`;

export const buildOutputFileName = (quiz: Quiz): string => `quiz_${quiz.tema.replace(/\s+/g, "_")}_${Date.now()}.mp4`;

export const runQuizPipeline = async (
  config: PipelineConfig,
  onProgress?: (progress: { stage: string; progress: number; message: string }) => void
): Promise<any> => {
  logger.info("🚀 Iniciando Pipeline de Quiz Shorts");

  // Step 1: Content Generation
  onProgress?.({ stage: "generating_quiz", progress: 10, message: "Gerando perguntas do quiz usando IA..." });
  const quiz = await generateQuiz(config);
  logger.info({ quiz }, "Quiz gerado com sucesso");

  const jobId = `quiz-${Date.now()}`;
  const jobWorkspace = path.join(config.tempDir, jobId);
  fs.mkdirSync(jobWorkspace, { recursive: true });

  const watermarkText = config.watermarkText || "@akitemquiz";
  const outputFileName = buildOutputFileName(quiz);
  const outputPath = path.join(config.outputDir, outputFileName);

  try {
    // Step 2: Speech Generation (TTS)
    onProgress?.({ stage: "generating_tts", progress: 30, message: "Gerando narração via Text-to-Speech..." });
    const questionText = quiz.pergunta;
    const answerText = buildAnswerNarration(quiz);

    const [questionNarration, answerNarration] = await Promise.all([
      generateNarration(questionText, "question", jobWorkspace),
      generateNarration(answerText, "answer", jobWorkspace),
    ]);

    // Step 3: Video Rendering (FFmpeg assembly)
    onProgress?.({ stage: "rendering", progress: 60, message: "Montando e renderizando vídeo via FFmpeg..." });
    await assembleVideo(
      quiz,
      {
        qPath: questionNarration.audioPath,
        aPath: answerNarration.audioPath,
        qWords: questionNarration.wordTimestamps,
        aWords: answerNarration.wordTimestamps,
      },
      outputPath,
      jobWorkspace,
      config
    );

    // Step 4: Publish to Telegram
    let telegramSent = false;
    if (config.telegramBotToken && config.telegramChatId) {
      onProgress?.({ stage: "publishing_telegram", progress: 80, message: "Publicando vídeo no Telegram..." });
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
      onProgress?.({ stage: "publishing_youtube", progress: 90, message: "Fazendo upload para o YouTube Shorts..." });
      const ytTitle = `Quiz: ${quiz.tema}!`;
      const ytDesc = `Teste seus conhecimentos! #quiz #shorts #curiosidades\n\nCanal: ${watermarkText}`;
      youtubeUrl = await uploadToYouTube(outputPath, ytTitle, ytDesc, config);
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

    onProgress?.({ stage: "done", progress: 100, message: "Pipeline de Quiz finalizada com sucesso!" });

    return {
      success: true,
      quiz,
      outputPath,
      telegramSent,
      youtubeUrl,
    };
  } catch (error: any) {
    logger.error({ error: error.message || error }, "❌ Falha crítica no pipeline do quiz");
    // Cleanup workspace on failure
    try {
      fs.rmSync(jobWorkspace, { recursive: true, force: true });
    /* v8 ignore next */ } catch {}
    throw error;
  }
};
