import { generateObject } from "ai";
import { quizSchema, type Quiz } from "./quiz.domain.js";
import { createModel } from "../ai-provider.js";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";

export const generateQuiz = async (config: PipelineConfig, customTopic?: string): Promise<Quiz> => {
  const topics = ["jogos", "filmes", "séries", "animes", "curiosidades gerais", "bíblia", "história", "ciência"];
  const topic = customTopic || topics[Math.floor(Math.random() * topics.length)] || "geral";

  const systemPrompt = `Você é um gerador de quizzes educativos extremamente rigoroso e preciso.
    O tema selecionado é: ${topic}.
    Regras Críticas:
    1. Verifique os fatos rigorosamente. Sem alucinações.
    2. Os textos DEVEM ser extremamente curtos e diretos (Shorts).
    3. Pergunta: máx 45 caracteres.
    4. Opções: máx 15 caracteres cada.
    5. Fato curioso: máx 60 caracteres (deve validar a resposta).
    6. Língua: Português do Brasil.`;

  try {
    const model = createModel(config);
    const { object } = await generateObject({
      model,
      schema: quizSchema,
      prompt: customTopic ? `Gere um quiz exatamente sobre: ${customTopic}` : `Gere um quiz sobre ${topic}.`,
      system: systemPrompt,
    });

    const quizResult = object as Quiz;
    if (!quizResult.tema) {
      quizResult.tema = topic;
    }

    return quizResult;
  } catch (error: any) {
    logger.error({ error: error.message || error }, "Erro na geração de conteúdo do quiz");
    throw new Error(`Falha na geração de conteúdo do quiz: ${error.message}`);
  }
};
