import { describe, expect, it } from "vitest";
import { applyAudit, buildAuditPrompt, quizAuditSchema, type QuizAudit } from "../../../src/core/quiz/quiz-audit.js";
import type { Quiz } from "../../../src/core/quiz/quiz.domain.js";

const question = (text: string, correct: "A" | "B" | "C" | "D" = "A") => ({
  pergunta: text,
  opcoes: { A: "um", B: "dois", C: "três", D: "quatro" },
  resposta_correta: correct,
});

const quiz = (): Quiz => ({
  tema: "futebol",
  titulo_youtube: "Só 1% acerta a 3ª de futebol",
  hook: "SÓ 1% ACERTA A 3ª",
  perguntas: [question("Primeira?"), question("Segunda?"), question("Terceira?")],
  fato_curioso: "O Brasil é pentacampeão.",
  tags: ["futebol"],
});

const verdict = (
  indice: number,
  letra_correta: "A" | "B" | "C" | "D",
  qualidade: "ok" | "ambigua" | "incorreta",
  confianca: "alta" | "media" | "baixa" = "alta",
  motivo = "",
) => ({ indice, letra_correta, confianca, qualidade, motivo });

const audit = (...avaliacoes: ReturnType<typeof verdict>[]): QuizAudit => quizAuditSchema.parse({ avaliacoes });

describe("quiz audit", () => {
  it("asks the model to solve the quiz without revealing the declared answer", () => {
    const prompt = buildAuditPrompt(quiz());
    expect(prompt).toContain("Primeira?");
    expect(prompt).toContain("A) um");
    expect(prompt).toContain("D) quatro");
    expect(prompt).toContain("0-based");
    expect(prompt).not.toContain("resposta_correta");
  });

  it("validates the audit payload shape", () => {
    expect(() => quizAuditSchema.parse({ avaliacoes: [] })).toThrow();
    expect(() => quizAuditSchema.parse({ avaliacoes: [{ indice: 0, letra_correta: "E" }] })).toThrow();
    expect(quizAuditSchema.parse({ avaliacoes: [{ indice: 0, letra_correta: "A", confianca: "alta", qualidade: "ok" }] }))
      .toMatchObject({ avaliacoes: [{ motivo: "" }] });
  });

  it("keeps a quiz the auditor agrees with", () => {
    const outcome = applyAudit(quiz(), audit(
      verdict(0, "A", "ok"), verdict(1, "A", "ok"), verdict(2, "A", "ok"),
    ));
    expect(outcome.quiz.perguntas.map((q) => q.resposta_correta)).toEqual(["A", "A", "A"]);
    expect(outcome.dropped).toEqual([]);
    expect(outcome.notes).toEqual([]);
  });

  it("corrects the answer key when the auditor is sure", () => {
    const outcome = applyAudit(quiz(), audit(
      verdict(0, "B", "ok", "alta", "a resposta certa é a B"),
      verdict(1, "A", "ok"),
      verdict(2, "A", "ok"),
    ));
    expect(outcome.quiz.perguntas[0]!.resposta_correta).toBe("B");
    expect(outcome.notes[0]).toContain("gabarito corrigido na pergunta 1: A → B");
    expect(outcome.notes[0]).toContain("a resposta certa é a B");
  });

  it("does not rewrite the key on a low-confidence disagreement", () => {
    const outcome = applyAudit(quiz(), audit(
      verdict(0, "B", "ok", "media"), verdict(1, "A", "ok"), verdict(2, "A", "ok"),
    ));
    expect(outcome.quiz.perguntas[0]!.resposta_correta).toBe("A");
    expect(outcome.notes).toEqual([]);
  });

  it("drops a question judged wrong and keeps the rest", () => {
    const outcome = applyAudit(quiz(), audit(
      verdict(0, "A", "ok"),
      verdict(1, "B", "incorreta", "alta", "o fato está errado"),
      verdict(2, "A", "ok"),
    ));
    expect(outcome.quiz.perguntas.map((q) => q.pergunta)).toEqual(["Primeira?", "Terceira?"]);
    expect(outcome.dropped).toEqual([1]);
    expect(outcome.notes[0]).toContain("descartada pergunta 2 (incorreta: o fato está errado)");
  });

  it("drops a wrong question even without a reason", () => {
    const outcome = applyAudit(quiz(), audit(
      verdict(0, "A", "ok"), verdict(1, "A", "incorreta", "alta"), verdict(2, "A", "ok"),
    ));
    expect(outcome.notes[0]).toBe("descartada pergunta 2 (incorreta)");
  });

  it("only drops an ambiguous question when the auditor is sure", () => {
    const unsure = applyAudit(quiz(), audit(
      verdict(0, "A", "ok"), verdict(1, "B", "ambigua", "media"), verdict(2, "A", "ok"),
    ));
    expect(unsure.quiz.perguntas).toHaveLength(3);

    const sure = applyAudit(quiz(), audit(
      verdict(0, "A", "ok"), verdict(1, "B", "ambigua", "alta", "duas opções defensáveis"), verdict(2, "A", "ok"),
    ));
    expect(sure.dropped).toEqual([1]);
  });

  it("never leaves fewer than two questions", () => {
    const twoQuestions = { ...quiz(), perguntas: [question("Primeira?"), question("Segunda?")] };
    const outcome = applyAudit(twoQuestions, audit(
      verdict(0, "A", "incorreta", "alta", "errada"),
      verdict(1, "A", "incorreta", "alta", "errada"),
    ));
    expect(outcome.quiz.perguntas).toHaveLength(2);
    expect(outcome.dropped).toEqual([]);
    expect(outcome.notes[0]).toContain("mantida apesar de \"incorreta\"");
  });

  it("ignores verdicts for indices outside the quiz and duplicate indices", () => {
    const outcome = applyAudit(quiz(), audit(
      verdict(9, "B", "incorreta"),
      verdict(0, "B", "ok"),
      verdict(0, "C", "incorreta"),
    ));
    expect(outcome.quiz.perguntas).toHaveLength(3);
    expect(outcome.quiz.perguntas[0]!.resposta_correta).toBe("B");
    expect(outcome.dropped).toEqual([]);
  });

  it("leaves questions the auditor did not mention untouched", () => {
    const outcome = applyAudit(quiz(), audit(verdict(0, "A", "ok")));
    expect(outcome.quiz.perguntas).toHaveLength(3);
    expect(outcome.dropped).toEqual([]);
  });
});
