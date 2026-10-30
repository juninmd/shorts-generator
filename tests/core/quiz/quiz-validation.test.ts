import { describe, expect, it } from "vitest";
import { findQuizIssues, normalizeText, repairQuizContent } from "../../../src/core/quiz/quiz-validation.js";
import type { Quiz } from "../../../src/core/quiz/quiz.domain.js";

const question = (text: string, opcoes: [string, string, string, string] = ["um", "dois", "três", "quatro"]) => ({
  pergunta: text,
  opcoes: { A: opcoes[0], B: opcoes[1], C: opcoes[2], D: opcoes[3] },
  resposta_correta: "A" as const,
});

const quizWith = (...perguntas: ReturnType<typeof question>[]): Quiz => ({
  tema: "futebol",
  titulo_youtube: "Só 1% acerta a 3ª de futebol",
  hook: "SÓ 1% ACERTA A 3ª",
  perguntas,
  fato_curioso: "O Brasil é pentacampeão.",
  tags: ["futebol"],
});

describe("quiz validation", () => {
  it("normalizes accents, case and punctuation for comparisons", () => {
    expect(normalizeText("  São PAULO, 2026! ")).toBe("sao paulo 2026");
    expect(normalizeText("Ação")).toBe(normalizeText("acao"));
  });

  it("accepts a clean quiz", () => {
    const quiz = quizWith(question("Primeira?"), question("Segunda?"));
    expect(findQuizIssues(quiz)).toEqual([]);
    expect(repairQuizContent(quiz)).toEqual({ quiz, dropped: [], notes: [] });
  });

  it("flags a repeated question regardless of accents and case", () => {
    const quiz = quizWith(question("Quem foi Pelé?"), question("quem foi pele"));
    const issues = findQuizIssues(quiz);
    expect(issues).toEqual([{ index: 1, kind: "duplicate_question", detail: "repete a pergunta 1" }]);

    const repaired = repairQuizContent(quizWith(
      question("Quem foi Pelé?"), question("quem foi pele"), question("Outra pergunta?"),
    ));
    expect(repaired.quiz.perguntas.map((q) => q.pergunta)).toEqual(["Quem foi Pelé?", "Outra pergunta?"]);
    expect(repaired.dropped).toEqual([1]);
    expect(repaired.notes[0]).toContain("pergunta 2");
  });

  it("flags two identical options inside one question", () => {
    const quiz = quizWith(question("Escolha?", ["Igual", "igual", "Outro", "Mais outro"]), question("Segunda?"));
    expect(findQuizIssues(quiz)[0]).toEqual({
      index: 0, kind: "duplicate_option", detail: "opções A e B são iguais",
    });
  });

  it("flags a placeholder left where an answer should be", () => {
    const quiz = quizWith(question("Escolha?", ["Alternativa A", "dois", "três", "quatro"]), question("Segunda?"));
    expect(findQuizIssues(quiz)[0]).toMatchObject({ kind: "placeholder_option", detail: "opção A é um placeholder" });

    const bare = quizWith(question("Escolha?", ["letra b", "dois", "três", "quatro"]), question("Segunda?"));
    expect(findQuizIssues(bare)[0]!.kind).toBe("placeholder_option");
  });

  it("collects every issue of a question in one note", () => {
    const quiz = quizWith(
      question("Escolha?", ["Opção B", "Opção B", "três", "quatro"]),
      question("Escolha?"),
      question("Terceira?"),
      question("Quarta?"),
    );
    const repaired = repairQuizContent(quiz);
    expect(repaired.dropped).toEqual([0, 1]);
    expect(repaired.notes[0]).toContain("; ");
  });

  it("refuses a quiz where fewer than two questions survive", () => {
    const quiz = quizWith(question("Igual?"), question("igual?"));
    expect(() => repairQuizContent(quiz)).toThrow(/Quiz inválido: 1 de 2 perguntas reprovadas/);
    expect(() => repairQuizContent(quiz)).toThrow(/pergunta 2: repete a pergunta 1/);
  });
});
