import { describe, it, expect } from "vitest";
import { buildTimeline, quizSchema, TIMER_SECONDS, OUTRO_TAIL_SECONDS } from "../../../src/core/quiz/quiz.domain.js";

describe("quiz.domain", () => {
  describe("buildTimeline", () => {
    it("computes sequential absolute timings for each question block", () => {
      const timeline = buildTimeline([3, 4], [2, 2.5], 5);

      expect(timeline.questions).toHaveLength(2);
      const [q0, q1] = timeline.questions;
      expect(q0).toEqual({ qStart: 0, timerStart: 3, revealStart: 3 + TIMER_SECONDS, revealEnd: 3 + TIMER_SECONDS + 2 });
      expect(q1!.qStart).toBe(q0!.revealEnd);
      expect(q1!.timerStart).toBe(q1!.qStart + 4);
      expect(q1!.revealEnd).toBe(q1!.revealStart + 2.5);
      expect(timeline.outroStart).toBe(q1!.revealEnd);
      expect(timeline.total).toBeCloseTo(q1!.revealEnd + 5 + OUTRO_TAIL_SECONDS);
    });

    it("throws on mismatched narration counts", () => {
      expect(() => buildTimeline([3], [], 5)).toThrow(/mismatch/);
      expect(() => buildTimeline([], [], 5)).toThrow(/mismatch/);
    });

    it("handles undefined array elements by defaulting to 0", () => {
      // Create an array with a "hole" (undefined) to test the `?? 0` fallback
      const qDurs = new Array(1);
      const aDurs = new Array(1);

      const timeline = buildTimeline(qDurs, aDurs, 5);

      expect(timeline.questions).toHaveLength(1);
      const q0 = timeline.questions[0];
      expect(q0!.timerStart).toBe(q0!.qStart + 0);
      expect(q0!.revealEnd).toBe(q0!.revealStart + 0);
    });
  });

  describe("quizSchema", () => {
    const validQuestion = {
      pergunta: "Quantas Copas o Brasil tem?",
      opcoes: { A: "Quatro", B: "Cinco", C: "Seis", D: "Três" },
      resposta_correta: "B",
    };
    const otherQuestion = (text: string) => ({ ...validQuestion, pergunta: text });

    const quizWith = (over: Record<string, unknown> = {}) => ({
      tema: "futebol",
      titulo_youtube: "Só 1% acerta a 3ª de futebol",
      hook: "SÓ 1% ACERTA A 3ª",
      perguntas: [validQuestion, otherQuestion("Quem é o maior artilheiro?"), otherQuestion("Qual seleção tem mais títulos?")],
      fato_curioso: "O Brasil é o único pentacampeão.",
      tags: ["futebol", "copa"],
      ...over,
    });

    it("accepts a multi-question quiz with metadata fields", () => {
      const parsed = quizSchema.parse(quizWith());
      expect(parsed.perguntas).toHaveLength(3);
    });

    it("trims and collapses whitespace in every text field", () => {
      const parsed = quizSchema.parse(quizWith({ tema: "  futebol   brasileiro " }));
      expect(parsed.tema).toBe("futebol brasileiro");
    });

    it("rejects a quiz with a single question", () => {
      expect(() => quizSchema.parse(quizWith({ perguntas: [validQuestion] }))).toThrow();
    });

    it("rejects repeated questions", () => {
      expect(() => quizSchema.parse(quizWith({
        perguntas: [validQuestion, otherQuestion("Quantas Copas o Brasil tem?"), otherQuestion("Outra pergunta?")],
      }))).toThrow(/pergunta repetida/);
    });

    it("rejects a question whose options repeat", () => {
      expect(() => quizSchema.parse(quizWith({
        perguntas: [
          { ...validQuestion, opcoes: { A: "Cinco", B: "cinco", C: "Seis", D: "Três" } },
          otherQuestion("Quem é o maior artilheiro?"),
        ],
      }))).toThrow();
    });

    it("rejects text that is too short or too long", () => {
      expect(() => quizSchema.parse(quizWith({ titulo_youtube: "abc" }))).toThrow();
      expect(() => quizSchema.parse(quizWith({ tema: "x".repeat(90) }))).toThrow();
      expect(() => quizSchema.parse(quizWith({
        perguntas: [{ ...validQuestion, pergunta: "abc" }, otherQuestion("Quem é o maior artilheiro?")],
      }))).toThrow();
      expect(() => quizSchema.parse(quizWith({
        perguntas: [{ ...validQuestion, opcoes: { ...validQuestion.opcoes, A: "x".repeat(41) } }, otherQuestion("Quem é?")],
      }))).toThrow();
    });

    it("rejects an empty tag list or too many tags", () => {
      expect(() => quizSchema.parse(quizWith({ tags: [] }))).toThrow();
      expect(() => quizSchema.parse(quizWith({ tags: Array.from({ length: 16 }, (_, i) => `tag${i}`) }))).toThrow();
    });
  });
});
