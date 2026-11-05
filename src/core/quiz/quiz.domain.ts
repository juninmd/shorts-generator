import { z } from "zod";
import { normalizeText } from "../text-normalize.js";

/** Seconds of countdown between the question narration and the reveal. */
export const TIMER_SECONDS = 3;
/** Silent tail after the outro narration so the video doesn't cut abruptly. */
export const OUTRO_TAIL_SECONDS = 0.5;
export const QUIZ_QUESTION_COUNT = 3;

const LIMITS = { pergunta: 45, opcao: 15, titulo: 60, hook: 22, fato: 80 } as const;
const OPTION_KEYS = ["A", "B", "C", "D"] as const;
// Catch-all options make the correct answer ambiguous.
const AMBIGUOUS_OPTIONS = new Set(["todas", "nenhuma", "todas as anteriores", "nenhuma das anteriores", "todas acima", "nenhuma acima", "ambas"]);
// Statistics nobody measured ("só 1% acerta") are not allowed on screen.
export const UNMEASURED_STAT = /\d+(?:[.,]\d+)?\s?%|por cento|quase ningu[eé]m acerta|ningu[eé]m acerta/i;

const text = (max: number) => z.string().trim().min(1).max(max);

export const quizQuestionSchema = z.object({
  pergunta: text(LIMITS.pergunta).refine((v) => v.length >= 8, "pergunta muito curta"),
  opcoes: z.object({ A: text(LIMITS.opcao), B: text(LIMITS.opcao), C: text(LIMITS.opcao), D: text(LIMITS.opcao) }),
  resposta_correta: z.enum(OPTION_KEYS),
}).superRefine((q, ctx) => {
  const normalized = OPTION_KEYS.map((k) => normalizeText(q.opcoes[k]));
  if (normalized.some((o) => !o)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "opção vazia após normalização" });
  if (new Set(normalized).size !== normalized.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "opções repetidas" });
  if (normalized.some((o) => AMBIGUOUS_OPTIONS.has(o))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "opção genérica torna a resposta ambígua" });
  const correct = normalizeText(q.opcoes[q.resposta_correta]);
  const overlapping = normalized.filter((o) => o !== correct && o && (` ${o} `.includes(` ${correct} `) || ` ${correct} `.includes(` ${o} `)));
  if (correct && overlapping.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "resposta correta contida em outra opção (ambígua)" });
});

export const quizSchema = z.object({
  tema: text(60),
  titulo_youtube: text(LIMITS.titulo),
  hook: text(LIMITS.hook),
  perguntas: z.array(quizQuestionSchema).length(QUIZ_QUESTION_COUNT),
  fato_curioso: text(LIMITS.fato),
  tags: z.array(text(40)).max(15),
}).superRefine((quiz, ctx) => {
  for (const field of ["titulo_youtube", "hook", "fato_curioso"] as const) {
    if (UNMEASURED_STAT.test(quiz[field])) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "estatística sem medição" });
  }
  const questions = quiz.perguntas.map((q) => normalizeText(q.pergunta));
  if (new Set(questions).size !== questions.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["perguntas"], message: "perguntas repetidas" });
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type Quiz = z.infer<typeof quizSchema>;

export function questionHash(q: QuizQuestion): string {
  return normalizeText(q.pergunta);
}

/** Absolute timing (seconds) of one question block inside the final video. */
export interface QuizSegmentTiming {
  qStart: number;
  timerStart: number;
  revealStart: number;
  revealEnd: number;
}

export interface QuizTimeline {
  questions: QuizSegmentTiming[];
  outroStart: number;
  total: number;
}

/** Build the absolute timeline from measured narration durations. */
export function buildTimeline(questionDurs: number[], answerDurs: number[], outroDur: number): QuizTimeline {
  if (questionDurs.length !== answerDurs.length || questionDurs.length === 0) {
    throw new Error("buildTimeline: question/answer duration count mismatch");
  }
  const questions: QuizSegmentTiming[] = [];
  let t = 0;
  for (let i = 0; i < questionDurs.length; i++) {
    const qStart = t;
    const timerStart = qStart + (questionDurs[i] ?? 0);
    const revealStart = timerStart + TIMER_SECONDS;
    const revealEnd = revealStart + (answerDurs[i] ?? 0);
    questions.push({ qStart, timerStart, revealStart, revealEnd });
    t = revealEnd;
  }
  return { questions, outroStart: t, total: t + outroDur + OUTRO_TAIL_SECONDS };
}
