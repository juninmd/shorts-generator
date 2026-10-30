import type { Quiz, QuizQuestion } from "./quiz.domain.js";

/**
 * Deterministic content checks for a generated quiz, before any rendering.
 * They catch what a schema cannot: a repeated question, two identical options,
 * a placeholder left where an answer should be. Questions that cannot be
 * repaired without inventing content are dropped so TTS/FFmpeg never see them.
 */

const PLACEHOLDER_OPTION = /^(alternativa|op[cç][aã]o|resposta|answer|letra)\b[\s:.-]*[a-d]?$/i;
const LETTERS = ["A", "B", "C", "D"] as const;

/** Accent- and punctuation-insensitive form used for equality checks. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type QuizIssueKind = "duplicate_question" | "duplicate_option" | "placeholder_option";

export interface QuizIssue {
  /** 0-based position in `quiz.perguntas`. */
  index: number;
  kind: QuizIssueKind;
  detail: string;
}

function questionIssues(question: QuizQuestion, index: number, seenQuestions: Map<string, number>): QuizIssue[] {
  const issues: QuizIssue[] = [];
  const key = normalizeText(question.pergunta);
  const first = seenQuestions.get(key);
  if (first !== undefined) {
    issues.push({ index, kind: "duplicate_question", detail: `repete a pergunta ${first + 1}` });
  } else {
    seenQuestions.set(key, index);
  }

  const seenOptions = new Map<string, string>();
  for (const letter of LETTERS) {
    const text = question.opcoes[letter];
    if (PLACEHOLDER_OPTION.test(text.trim())) {
      issues.push({ index, kind: "placeholder_option", detail: `opção ${letter} é um placeholder` });
      continue;
    }
    const normalized = normalizeText(text);
    const duplicateOf = seenOptions.get(normalized);
    if (duplicateOf) {
      issues.push({ index, kind: "duplicate_option", detail: `opções ${duplicateOf} e ${letter} são iguais` });
    } else {
      seenOptions.set(normalized, letter);
    }
  }
  return issues;
}

/** Every deterministic problem in the quiz, in question order. */
export function findQuizIssues(quiz: Quiz): QuizIssue[] {
  const seenQuestions = new Map<string, number>();
  return quiz.perguntas.flatMap((question, index) => questionIssues(question, index, seenQuestions));
}

export interface QuizRepair {
  quiz: Quiz;
  /** 0-based indices removed, so the caller can ask for replacements. */
  dropped: number[];
  notes: string[];
}

/**
 * Drop the questions the deterministic checks reject. Fewer than two survivors is
 * a broken quiz: it fails here instead of becoming a one-question video.
 */
export function repairQuizContent(quiz: Quiz): QuizRepair {
  const issues = findQuizIssues(quiz);
  if (issues.length === 0) return { quiz, dropped: [], notes: [] };

  const rejected = new Map<number, string>();
  for (const issue of issues) {
    const reason = `pergunta ${issue.index + 1}: ${issue.detail}`;
    rejected.set(issue.index, rejected.has(issue.index) ? `${rejected.get(issue.index)}; ${issue.detail}` : reason);
  }

  const perguntas = quiz.perguntas.filter((_, index) => !rejected.has(index));
  if (perguntas.length < 2) {
    throw new Error(`Quiz inválido: ${rejected.size} de ${quiz.perguntas.length} perguntas reprovadas na validação (${[...rejected.values()].join("; ")})`);
  }

  const dropped = [...rejected.keys()].sort((a, b) => a - b);
  return {
    quiz: { ...quiz, perguntas },
    dropped,
    notes: dropped.map((index) => `descartada ${rejected.get(index)}`),
  };
}
