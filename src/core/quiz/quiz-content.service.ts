import { quizSchema, type Quiz } from "./quiz.domain.js";
import { createModel } from "../ai-provider.js";
import { generateJsonObject } from "../generate-json.js";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";
import { buildEditorialPromptBlock, DEFAULT_EDITORIAL_PROFILE, languageLabel } from "../editorial/editorial-profile.js";

const QUIZ_JSON_FORMAT = `Formato JSON EXATO (respeite as chaves e o tipo de cada campo):
{"tema":"...","titulo_youtube":"...","hook":"...","perguntas":[{"pergunta":"...","opcoes":{"A":"...","B":"...","C":"...","D":"..."},"resposta_correta":"A"}],"fato_curioso":"...","tags":["...","..."]}`;

export const DEFAULT_QUIZ_TOPICS = [
  "futebol brasileiro", "conhecimentos gerais", "bandeiras e capitais",
  "filmes e séries", "história do Brasil", "bíblia", "ciência", "animes",
];

/** Topic pool from the editorial profile (allowed themes win); excluded themes never chosen. */
export function pickQuizTopic(config: PipelineConfig, customTopic?: string, random = Math.random): string {
  if (customTopic) return customTopic;
  const profile = config.managedRun?.editorial ?? DEFAULT_EDITORIAL_PROFILE;
  const excluded = new Set(profile.excludedThemes.map((t) => t.toLowerCase()));
  const pool = (profile.allowedThemes.length ? profile.allowedThemes : DEFAULT_QUIZ_TOPICS).filter((t) => !excluded.has(t.toLowerCase()));
  const topics = pool.length ? pool : DEFAULT_QUIZ_TOPICS;
  return topics[Math.floor(random() * topics.length)]!;
}

export function buildQuizSystemPrompt(topic: string, config: PipelineConfig, avoidQuestions: readonly string[] = []): string {
  const profile = config.managedRun?.editorial ?? DEFAULT_EDITORIAL_PROFILE;
  const avoid = avoidQuestions.length ? `\n    10. NÃO repita estas perguntas já usadas: ${avoidQuestions.slice(0, 30).join(" | ")}` : "";
  return `Você é um criador de quizzes para YouTube Shorts, rigoroso com fatos.
    O tema selecionado é: ${topic}.
    ${buildEditorialPromptBlock(profile, config.managedRun?.focusLabels ?? [])}
    Regras Críticas:
    1. Use apenas fatos estáveis e verificáveis em enciclopédias. A resposta correta deve ser única e indiscutível.
    2. Gere EXATAMENTE 3 perguntas com dificuldade crescente (fácil, média, difícil).
    3. Textos curtos: pergunta máx 45 caracteres; cada opção máx 15 caracteres.
    4. 4 opções plausíveis e diferentes entre si; proibido "todas as anteriores"/"nenhuma".
    5. titulo_youtube: título único e específico, máx 60 caracteres.
    6. hook: frase de impacto para a tela, máx 22 caracteres, caixa alta.
    7. NÃO invente estatísticas nem percentuais de acerto (nada de "só 1% acerta").
    8. fato_curioso: fato verificável relacionado à 3ª pergunta, máx 80 caracteres.
    9. tags: 8 a 12 termos de busca específicos do tema (sem #). Língua: ${languageLabel(profile.language)}.${avoid}`;
}

export const generateQuiz = async (config: PipelineConfig, customTopic?: string, avoidQuestions: readonly string[] = []): Promise<Quiz> => {
  const topic = pickQuizTopic(config, customTopic);
  try {
    const model = createModel(config);
    const basePrompt = customTopic ? `Gere um quiz exatamente sobre: ${customTopic}` : `Gere um quiz sobre ${topic}.`;
    // Reasoning models spend output tokens before the JSON, so the budget stays generous.
    const quizResult = await generateJsonObject<Quiz>({
      model,
      schema: quizSchema,
      prompt: `${basePrompt}\n\n${QUIZ_JSON_FORMAT}`,
      system: buildQuizSystemPrompt(topic, config, avoidQuestions),
      maxOutputTokens: 4000,
    });
    return { ...quizResult, tema: quizResult.tema || topic };
  } catch (error: any) {
    logger.error({ error: error.message || error }, "Erro na geração de conteúdo do quiz");
    throw new Error(`Falha na geração de conteúdo do quiz: ${error.message}`);
  }
};
