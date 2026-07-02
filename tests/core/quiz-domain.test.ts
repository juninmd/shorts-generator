import { describe, it, expect } from "vitest";
import { buildTimeline, quizSchema, TIMER_SECONDS, OUTRO_TAIL_SECONDS } from "../../src/core/quiz/quiz.domain.js";

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
  });

  describe("quizSchema", () => {
    const validQuestion = {
      pergunta: "Quantas Copas o Brasil tem?",
      opcoes: { A: "Quatro", B: "Cinco", C: "Seis", D: "Três" },
      resposta_correta: "B",
    };

    it("accepts a multi-question quiz with metadata fields", () => {
      const parsed = quizSchema.parse({
        tema: "futebol",
        titulo_youtube: "Só 1% acerta a 3ª de futebol",
        hook: "SÓ 1% ACERTA A 3ª",
        perguntas: [validQuestion, validQuestion, validQuestion],
        fato_curioso: "O Brasil é o único pentacampeão.",
        tags: ["futebol", "copa"],
      });
      expect(parsed.perguntas).toHaveLength(3);
    });

    it("rejects a quiz with a single question", () => {
      expect(() =>
        quizSchema.parse({
          tema: "futebol",
          titulo_youtube: "t",
          hook: "h",
          perguntas: [validQuestion],
          fato_curioso: "f",
          tags: [],
        }),
      ).toThrow();
    });
  });
});
