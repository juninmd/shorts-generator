import "dotenv/config";
import { analyzeTranscript } from "../src/core/analyzer.js";
import type { Transcript, PipelineConfig } from "../src/types.js";
import { logger } from "../src/core/logger.js";

async function test() {
  const transcript: Transcript = {
    videoId: "test_video",
    language: "pt",
    duration: 120,
    fullText: "Bíblia Bertha, Cartilha de oração. Eu vou retomar a temática. A partir do versículo 15 salto para o 19. Eu não entendo o que faz. Pois não faço o que gostaria de fazer. Foi o que Paulo disse aos Romanos. O bem que eu quero, eu não faço. O mal que eu não quero, esse eu faço. Infeliz de mim! Quem me libertará deste corpo de morte? Graças a Deus por Jesus Cristo, nosso Senhor. Portanto, meus irmãos, a lei do pecado habita em meus membros.",
    segments: [
      { start: 0, end: 5, text: "Bíblia Bertha, Cartilha de oração." },
      { start: 9, end: 12, text: "Eu vou retomar a temática." },
      { start: 12, end: 16, text: "A partir do versículo 15 salto" },
      { start: 16, end: 19, text: "para o 19. Eu não entendo" },
      { start: 19, end: 22, text: "o que faz. Pois não faço" },
      { start: 22, end: 25, text: "o que gostaria de fazer." },
      { start: 25, end: 30, text: "Foi o que Paulo disse aos Romanos." },
      { start: 30, end: 35, text: "O bem que eu quero, eu não faço." },
      { start: 35, end: 40, text: "O mal que eu não quero, esse eu faço." },
      { start: 40, end: 45, text: "Infeliz de mim! Quem me libertará deste corpo de morte?" },
      { start: 45, end: 50, text: "Graças a Deus por Jesus Cristo, nosso Senhor." },
      { start: 50, end: 60, text: "Portanto, meus irmãos, a lei do pecado habita em meus membros." },
    ],
    words: [] // Simplified for test
  };

  const config: PipelineConfig = {
    channels: [],
    specificUrls: [],
    videoLimit: 1,
    maxCutsPerBlock: 3,
    minuteBlockSize: 5,
    maxShortDuration: 59,
    minShortDuration: 5,
    maxVideoSizeBytes: 500 * 1024 * 1024,
    minShortsPerVideo: 1,
    outputDir: "./output",
    tempDir: "./temp",
    aiProvider: "openrouter",
    aiModel: "google/gemini-2.0-flash-lite-001",
    aiTimeoutMs: 300000,
    openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
    ollamaBaseUrl: "",
    whisperModel: "tiny",
    telegramBotToken: "",
    telegramChatId: "",
    verticalWidth: 1080,
    verticalHeight: 1920,
    watermarkText: "Test",
    videoEncoder: "libx264",
    maxClipsOverride: 3
  };

  logger.info("Iniciando teste de análise...");
  try {
    const clips = await analyzeTranscript(transcript, "O Pecado em Mim", "Padre Manzotti", config);
    console.log("CORTES GERADOS:");
    console.log(JSON.stringify(clips, null, 2));
  } catch (error) {
    logger.error({ error }, "Erro no teste de análise");
  }
}

test();
