import { describe, expect, it } from "vitest";
import { balanceAnswerKey, hashSeed, shuffle } from "../../../src/core/quiz/quiz-shuffle.js";
import type { Quiz } from "../../../src/core/quiz/quiz.domain.js";

const quiz = (): Quiz => ({
  tema: "futebol",
  titulo_youtube: "Só 1% acerta a 3ª de futebol",
  hook: "SÓ 1% ACERTA A 3ª",
  perguntas: [
    { pergunta: "Primeira?", opcoes: { A: "um", B: "dois", C: "três", D: "quatro" }, resposta_correta: "A" },
    { pergunta: "Segunda?", opcoes: { A: "um", B: "dois", C: "três", D: "quatro" }, resposta_correta: "A" },
    { pergunta: "Terceira?", opcoes: { A: "um", B: "dois", C: "três", D: "quatro" }, resposta_correta: "A" },
  ],
  fato_curioso: "O Brasil é pentacampeão.",
  tags: ["futebol"],
});

describe("quiz answer shuffle", () => {
  it("hashes deterministically and distributes the shuffle", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
    expect(shuffle([1, 2, 3, 4], "seed")).toHaveLength(4);
    expect(shuffle([1, 2, 3, 4], "seed")).toEqual(shuffle([1, 2, 3, 4], "seed"));
    expect(shuffle(["a"], "seed")).toEqual(["a"]);
  });

  it("moves the correct answer to a different letter than the model chose", () => {
    const balanced = balanceAnswerKey(quiz());
    const letters = balanced.quiz.perguntas.map((q) => q.resposta_correta);
    expect(new Set(letters).size).toBeGreaterThan(1);
    // the correct text never changes, only its letter
    expect(balanced.quiz.perguntas.map((q) => q.opcoes[q.resposta_correta])).toEqual(["um", "um", "um"]);
    expect(balanced.notes.join(" ")).toContain("resposta movida");
  });

  it("keeps every option exactly once per question", () => {
    for (const question of balanceAnswerKey(quiz()).quiz.perguntas) {
      expect(Object.values(question.opcoes).sort()).toEqual(["dois", "quatro", "três", "um"]);
    }
  });

  it("rotates the answer letters across questions", () => {
    const letters = balanceAnswerKey(quiz(), "tema-fixo").quiz.perguntas.map((q) => q.resposta_correta);
    expect(new Set(letters).size).toBe(3);
  });

  it("is deterministic, so a retry renders the same quiz", () => {
    expect(balanceAnswerKey(quiz())).toEqual(balanceAnswerKey(quiz()));
  });

  it("leaves a question with duplicate option texts untouched", () => {
    const broken = quiz();
    broken.perguntas[0] = {
      pergunta: "Primeira?", opcoes: { A: "um", B: "um", C: "três", D: "quatro" }, resposta_correta: "A",
    };
    const balanced = balanceAnswerKey(broken);
    expect(balanced.quiz.perguntas[0]!.opcoes).toEqual({ A: "um", B: "um", C: "três", D: "quatro" });
  });
});
