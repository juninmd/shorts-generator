
import { z } from "zod";
import { normalizeText } from "./quiz-validation.js";

/** Seconds of countdown between the question narration and the reveal. */
export const TIMER_SECONDS = 3;
/** Silent tail after the outro narration so the video doesn't cut abruptly. */
export const OUTRO_TAIL_SECONDS = 0.5;

const LETTERS = ["A", "B", "C", "D"] as const;

/** Trimmed single-line text with hard bounds, so a runaway field is retried instead of rendered. */
const text = (min: number, max: number) =>
  z.string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(min, `texto curto demais (mínimo ${min})`).max(max, `texto longo demais (máximo ${max})`));

export const quizQuestionSchema = z.object({
  pergunta: text(5, 120),
  opcoes: z.object({
    A: text(1, 40),
    B: text(1, 40),
    C: text(1, 40),
    D: text(1, 40),
  }),
  resposta_correta: z.enum(LETTERS),
}).superRefine((question, ctx) => {
  const seen = new Set<string>();
  for (const letter of LETTERS) {
    const key = normalizeText(question.opcoes[letter]);
    if (seen.has(key)) {
      ctx.addIssue({
        code: "custom",
        message: `opções ${letter} e outra são iguais`,
        path: ["opcoes", letter],
      });
    }
    seen.add(key);
  }
});

export const quizSchema = z.object({
  tema: text(2, 80),
  titulo_youtube: text(5, 100),
  hook: text(2, 60),
  perguntas: z.array(quizQuestionSchema).min(2, "mínimo de 2 perguntas").max(4, "máximo de 4 perguntas"),
  fato_curioso: text(5, 200),
  tags: z.array(text(1, 40)).min(1).max(15),
}).superRefine((quiz, ctx) => {
  const seen = new Set<string>();
  quiz.perguntas.forEach((question, index) => {
    const key = normalizeText(question.pergunta);
    if (seen.has(key)) {
      ctx.addIssue({ code: "custom", message: "pergunta repetida", path: ["perguntas", index, "pergunta"] });
    }
    seen.add(key);
  });
});

/** Shape of a "give me N replacement questions" answer. */
export const replacementQuestionsSchema = z.object({
  perguntas: z.array(quizQuestionSchema).min(1).max(4),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type Quiz = z.infer<typeof quizSchema>;

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
