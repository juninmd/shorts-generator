import { describe, it, expect } from "vitest";
import {
  buildRevealNarration,
  buildOutroNarration,
  buildTelegramCaption,
  buildYoutubeMetadata,
  buildOutputFileName,
} from "../../../src/core/quiz/quiz-pipeline.js";
import type { Quiz } from "../../../src/core/quiz/quiz.domain.js";

const quiz: Quiz = {
  tema: "história do Brasil",
  titulo_youtube: "Só 1% acerta a 3ª de História 🧠",
  hook: "SÓ 1% ACERTA A 3ª",
  perguntas: [
    { pergunta: "Quem proclamou a República?", opcoes: { A: "Deodoro", B: "Pedro II", C: "Getúlio", D: "JK" }, resposta_correta: "A" },
    { pergunta: "Ano do descobrimento?", opcoes: { A: "1400", B: "1500", C: "1600", D: "1550" }, resposta_correta: "B" },
  ],
  fato_curioso: "Deodoro proclamou a República meio doente.",
  tags: ["história", "brasil"],
};

describe("quiz-pipeline helpers", () => {
  it("buildRevealNarration announces letter and answer", () => {
    expect(buildRevealNarration(quiz.perguntas[0]!)).toBe("Letra A: Deodoro!");
  });

  it("buildOutroNarration includes the fact and a comment CTA", () => {
    const outro = buildOutroNarration(quiz);
    expect(outro).toContain(quiz.fato_curioso);
    expect(outro).toContain("Comenta quantas você acertou");
  });

  it("buildTelegramCaption uses the unique title and first question", () => {
    const caption = buildTelegramCaption(quiz, "@akitemquiz");
    expect(caption).toContain(quiz.titulo_youtube);
    expect(caption).toContain(quiz.perguntas[0]!.pergunta);
  });

  it("buildYoutubeMetadata produces unique title, hashtag description and content tags", () => {
    const meta = buildYoutubeMetadata(quiz, "@akitemquiz");
    expect(meta.title).toBe(quiz.titulo_youtube);
    expect(meta.description).toContain("#shorts #quiz #historiadobrasil");
    expect(meta.description).toContain("Comenta quantas você acertou");
    expect(meta.tags).toEqual(["história", "brasil", "história do Brasil", "quiz"]);
  });

  it("buildYoutubeMetadata falls back to the first question when the title is empty", () => {
    const meta = buildYoutubeMetadata({ ...quiz, titulo_youtube: "" }, "@akitemquiz");
    expect(meta.title).toContain("Quem proclamou a República?");
  });

  it("buildOutputFileName slugs the theme", () => {
    expect(buildOutputFileName(quiz)).toMatch(/^quiz_história_do_Brasil_\d+\.mp4$/);
  });
});
