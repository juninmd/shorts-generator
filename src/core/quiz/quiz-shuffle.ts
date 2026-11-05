import type { Quiz } from "./quiz.domain.js";

/**
 * Answer-key distribution. A model tends to put the right answer on the same
 * letter run after run ("letra B" every video), which viewers learn and which
 * makes the game trivial. Options are reordered deterministically (same quiz →
 * same layout, so a retry is reproducible) and the key is moved to a letter that
 * rotates across questions.
 */

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];

/** FNV-1a: tiny, stable across runs, good enough to seed the shuffle. */
export function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Deterministic Fisher-Yates driven by a mulberry32 generator. */
export function shuffle<T>(items: readonly T[], seed: string): T[] {
  const output = [...items];
  let state = hashSeed(seed);
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [output[i], output[j]] = [output[j]!, output[i]!];
  }
  return output;
}

export interface BalancedQuiz {
  quiz: Quiz;
  notes: string[];
}

/**
 * Move each correct option so the key rotates through the letters. A question
 * whose options are not four distinct texts is left untouched (the deterministic
 * validation is expected to have dropped those already).
 */
export function balanceAnswerKey(quiz: Quiz, seed = quiz.tema): BalancedQuiz {
  const offset = hashSeed(seed) % LETTERS.length;
  const notes: string[] = [];

  const perguntas = quiz.perguntas.map((question, index) => {
    const target = LETTERS[(offset + index) % LETTERS.length]!;
    const correctText = question.opcoes[question.resposta_correta];
    const others = LETTERS.map((letter) => question.opcoes[letter]).filter((text) => text !== correctText);
    if (others.length !== LETTERS.length - 1) return question;

    const mixed = shuffle(others, `${seed}:${question.pergunta}`);
    const opcoes = { ...question.opcoes };
    let cursor = 0;
    for (const letter of LETTERS) {
      opcoes[letter] = letter === target ? correctText : mixed[cursor++]!;
    }
    if (target !== question.resposta_correta) {
      notes.push(`pergunta ${index + 1}: resposta movida de ${question.resposta_correta} para ${target}`);
    }
    return { ...question, opcoes, resposta_correta: target as Letter };
  });

  return { quiz: { ...quiz, perguntas }, notes };
}
