import { quizSchema, replacementQuestionsSchema, type Quiz, type QuizQuestion } from "./quiz.domain.js";
import { createModel } from "../ai-provider.js";
import { generateJsonObject } from "../generate-json.js";
import { repairQuizContent } from "./quiz-validation.js";
import { applyAudit, buildAuditPrompt, QUIZ_AUDIT_SYSTEM, quizAuditSchema, type QuizAudit } from "./quiz-audit.js";
import { balanceAnswerKey } from "./quiz-shuffle.js";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";

const QUIZ_JSON_FORMAT = `Formato JSON EXATO (respeite as chaves e o tipo de cada campo):
{"tema":"...","titulo_youtube":"...","hook":"...","perguntas":[{"pergunta":"...","opcoes":{"A":"...","B":"...","C":"...","D":"..."},"resposta_correta":"A"}],"fato_curioso":"...","tags":["...","..."]}`;

const TOPICS = [
  "futebol brasileiro", "conhecimentos gerais", "bandeiras e capitais",
  "filmes e séries", "história do Brasil", "bíblia", "ciência", "animes",
];

const MAX_QUESTIONS = 4;

/** First generation: the quiz itself. Trailers like length/difficulty are enforced by the schema. */
async function requestQuiz(config: PipelineConfig, topic: string, customTopic?: string): Promise<Quiz> {
  const model = createModel(config);
  const basePrompt = customTopic ? `Gere um quiz exatamente sobre: ${customTopic}` : `Gere um quiz sobre ${topic}.`;
  const systemPrompt = `Você é um criador de quizzes virais para YouTube Shorts, rigoroso com fatos.
    O tema selecionado é: ${topic}.
    Regras Críticas:
    1. Verifique os fatos rigorosamente. Sem alucinações. A resposta correta deve ser INDISCUTÍVEL.
    2. Gere EXATAMENTE 3 perguntas com dificuldade CRESCENTE:
       - Pergunta 1: fácil (80% acertam — dá confiança e segura o viewer)
       - Pergunta 2: média (50% acertam)
       - Pergunta 3: difícil ("só 1% acerta" — o motivo do viewer comentar)
    3. Textos curtos: pergunta máx 45 caracteres; cada opção máx 15 caracteres.
    4. As 4 opções devem ser plausíveis (sem respostas obviamente erradas), distintas entre si e
       todas do mesmo tipo (não misture números com nomes).
    5. titulo_youtube: título ÚNICO e específico deste quiz, máx 60 caracteres, com gatilho de
       curiosidade nos primeiros 40 (ex: "Só 1% acerta a 3ª pergunta de futebol 🧠").
       PROIBIDO o formato genérico "Quiz: tema!".
    6. hook: frase de impacto para a tela, máx 22 caracteres, caixa alta (ex: "SÓ 1% ACERTA A 3ª").
    7. fato_curioso: fato surpreendente que valida a resposta da 3ª pergunta, máx 80 caracteres.
    8. tags: 8 a 12 termos de busca específicos do tema (sem #).
    9. Língua: Português do Brasil.`;
  return generateJsonObject<Quiz>({
    model,
    schema: quizSchema,
    prompt: `${basePrompt}\n\n${QUIZ_JSON_FORMAT}`,
    system: systemPrompt,
    // O orcamento nao pode ser dimensionado so pelo tamanho do JSON: os modelos
    // servidos pelo litellm hoje sao de raciocinio (gpt-oss) e os tokens de
    // raciocinio saem do MESMO orcamento de saida.
    maxOutputTokens: 4000,
  });
}

/** Second opinion, blind to the declared answer. Best-effort: a failure must not block the quiz. */
async function auditQuiz(quiz: Quiz, config: PipelineConfig): Promise<QuizAudit | null> {
  try {
    return await generateJsonObject<QuizAudit>({
      model: createModel(config),
      schema: quizAuditSchema,
      prompt: buildAuditPrompt(quiz),
      system: QUIZ_AUDIT_SYSTEM,
      temperature: 0,
      maxOutputTokens: 2500,
      // The audit is an extra hop: a slow gateway may delay it, never stall the job.
      attemptTimeoutMs: 30_000,
      maxRetries: 1,
    });
  } catch (error: any) {
    logger.warn({ error: error?.message || error }, "Auditoria do quiz falhou — seguindo com a validação determinística");
    return null;
  }
}

/** Ask for replacement questions when the audit rejected some. Best-effort, capped at 4 total. */
async function requestReplacements(quiz: Quiz, count: number, config: PipelineConfig): Promise<QuizQuestion[]> {
  try {
    const result = await generateJsonObject<{ perguntas: QuizQuestion[] }>({
      model: createModel(config),
      schema: replacementQuestionsSchema,
      prompt: `Gere ${count} pergunta(s) NOVAS, factuais e de dificuldade alta, para o quiz de "${quiz.tema}". `
        + `Não repita nenhuma destas: ${quiz.perguntas.map((question) => question.pergunta).join(" | ")}.\n\n`
        + QUIZ_JSON_FORMAT,
      system: "Você é um criador de quizzes rigoroso com fatos. Responda em português do Brasil.",
      maxOutputTokens: 2000,
      attemptTimeoutMs: 30_000,
      maxRetries: 1,
    });
    return result.perguntas.slice(0, count);
  } catch (error: any) {
    logger.warn({ error: error?.message || error }, "Não foi possível gerar perguntas substitutas");
    return [];
  }
}

/**
 * Generate, validate and balance a quiz:
 * 1. generation (schema rejects shape problems and retries);
 * 2. deterministic repair (repeated questions, equal/placeholder options);
 * 3. blind answer-key audit, with wrong keys fixed and bad questions replaced;
 * 4. answer-letter rotation so the right answer is not always on the same letter.
 */
export const generateQuiz = async (config: PipelineConfig, customTopic?: string): Promise<Quiz> => {
  const topic = customTopic || TOPICS[Math.floor(Math.random() * TOPICS.length)]!;
  try {
    let quiz = await requestQuiz(config, topic, customTopic);
    if (!quiz.tema) quiz.tema = topic;

    const repaired = repairQuizContent(quiz);
    for (const note of repaired.notes) logger.warn({ quiz: quiz.tema }, `Conteúdo do quiz: ${note}`);
    quiz = repaired.quiz;

    if (process.env.QUIZ_AUDIT !== "false") {
      logger.info({ tema: quiz.tema }, "Auditando gabarito com segunda opinião (sem ver a resposta declarada)");
      const audit = await auditQuiz(quiz, config);
      if (audit) {
        const outcome = applyAudit(quiz, audit);
        for (const note of outcome.notes) logger.info({ quiz: quiz.tema }, `Auditoria do quiz: ${note}`);
        quiz = outcome.quiz;
        if (outcome.dropped.length > 0) {
          const replacements = await requestReplacements(quiz, outcome.dropped.length, config);
          if (replacements.length > 0) {
            quiz = repairQuizContent({
              ...quiz,
              perguntas: [...quiz.perguntas, ...replacements].slice(0, MAX_QUESTIONS),
            }).quiz;
          }
        }
      }
    }

    const balanced = balanceAnswerKey(quiz);
    for (const note of balanced.notes) logger.info({ quiz: quiz.tema }, `Gabarito: ${note}`);
    return balanced.quiz;
  } catch (error: any) {
    logger.error({ error: error.message || error }, "Erro na geração de conteúdo do quiz");
    throw new Error(`Falha na geração de conteúdo do quiz: ${error.message}`);
  }
};
