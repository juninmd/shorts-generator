/* v8 ignore start */
import { z } from "zod";

/** Seconds of countdown between the question narration and the reveal. */
export const TIMER_SECONDS = 3;
/** Silent tail after the outro narration so the video doesn't cut abruptly. */
export const OUTRO_TAIL_SECONDS = 0.5;

export const quizQuestionSchema = z.object({
  pergunta: z.string(),
  opcoes: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
  }),
  resposta_correta: z.enum(["A", "B", "C", "D"]),
});

export const quizSchema = z.object({
  tema: z.string(),
  titulo_youtube: z.string(),
  hook: z.string(),
  perguntas: z.array(quizQuestionSchema).min(2).max(4),
  fato_curioso: z.string(),
  tags: z.array(z.string()),
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

/* v8 ignore stop */
