import { generateObject } from "ai";
import { quizSchema, type Quiz } from "./quiz.domain.js";
import { createModel } from "../ai-provider.js";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";

export const generateQuiz = async (config: PipelineConfig, customTopic?: string): Promise<Quiz> => {
  const topics = [
    "futebol brasileiro", "conhecimentos gerais", "bandeiras e capitais",
    "filmes e séries", "história do Brasil", "bíblia", "ciência", "animes",
  ];
  const topic = customTopic || topics[Math.floor(Math.random() * topics.length)] || "conhecimentos gerais";

  const systemPrompt = `Você é um criador de quizzes virais para YouTube Shorts, rigoroso com fatos.
    O tema selecionado é: ${topic}.
    Regras Críticas:
    1. Verifique os fatos rigorosamente. Sem alucinações. A resposta correta deve ser INDISCUTÍVEL.
    2. Gere EXATAMENTE 3 perguntas com dificuldade CRESCENTE:
       - Pergunta 1: fácil (80% acertam — dá confiança e segura o viewer)
       - Pergunta 2: média (50% acertam)
       - Pergunta 3: difícil ("só 1% acerta" — o motivo do viewer comentar)
    3. Textos curtos: pergunta máx 45 caracteres; cada opção máx 15 caracteres.
    4. As 4 opções devem ser plausíveis (sem respostas obviamente erradas).
    5. titulo_youtube: título ÚNICO e específico deste quiz, máx 60 caracteres, com gatilho de
       curiosidade nos primeiros 40 (ex: "Só 1% acerta a 3ª pergunta de futebol 🧠").
       PROIBIDO o formato genérico "Quiz: tema!".
    6. hook: frase de impacto para a tela, máx 22 caracteres, caixa alta (ex: "SÓ 1% ACERTA A 3ª").
    7. fato_curioso: fato surpreendente que valida a resposta da 3ª pergunta, máx 80 caracteres.
    8. tags: 8 a 12 termos de busca específicos do tema (sem #).
    9. Língua: Português do Brasil.`;

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
