import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateQuiz } from "../../../src/core/quiz/quiz-content.service.js";
import { generateJsonObject } from "../../../src/core/generate-json.js";
import { logger } from "../../../src/core/logger.js";
import * as aiProvider from "../../../src/core/ai-provider.js";

vi.mock("../../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../../src/core/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../../../src/core/ai-provider.js", () => ({ createModel: vi.fn().mockReturnValue({}) }));

describe("quiz-content.service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(aiProvider, "createModel").mockReturnValue({} as any);
  });

  const validQuiz = {
    tema: "test tema",
    titulo_youtube: "Só 1% acerta a 3ª de test",
    hook: "SÓ 1% ACERTA A 3ª",
    perguntas: [
      { pergunta: "P1?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "A" },
      { pergunta: "P2?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "B" },
      { pergunta: "P3?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "C" },
    ],
    fato_curioso: "curious fact",
    tags: ["test"],
  };

  it("generates a quiz with custom topic", async () => {
    vi.mocked(generateJsonObject).mockResolvedValue(validQuiz as any);

    const config = { tempDir: "temp", outputDir: "out" };
    const quiz = await generateQuiz(config, "custom topic");

    expect(quiz).toEqual(validQuiz);
    expect(generateJsonObject).toHaveBeenCalled();
    expect(vi.mocked(generateJsonObject).mock.calls[0][0].prompt).toContain("custom topic");
  });

  it("generates a quiz without custom topic", async () => {
    vi.mocked(generateJsonObject).mockResolvedValue(validQuiz as any);

    const config = { tempDir: "temp", outputDir: "out" };
    const quiz = await generateQuiz(config);

    expect(quiz).toEqual(validQuiz);
    expect(generateJsonObject).toHaveBeenCalled();
  });

  it("fills tema if absent in the LLM response", async () => {
    const quizWithoutTema = { ...validQuiz, tema: undefined };
    vi.mocked(generateJsonObject).mockResolvedValue(quizWithoutTema as any);

    const config = { tempDir: "temp", outputDir: "out" };
    const quiz = await generateQuiz(config, "custom topic");

    expect(quiz.tema).toBe("custom topic");
  });

  it("throws error if generateJsonObject fails", async () => {
    vi.mocked(generateJsonObject).mockRejectedValue(new Error("LLM failure"));

    const config = { tempDir: "temp", outputDir: "out" };
    await expect(generateQuiz(config, "custom topic")).rejects.toThrow("Falha na geração de conteúdo do quiz: LLM failure");
    expect(logger.error).toHaveBeenCalled();
  });

  it("throws error if generateJsonObject fails with non error object", async () => {
    vi.mocked(generateJsonObject).mockRejectedValue("string err");

    const config = { tempDir: "temp", outputDir: "out" };
    await expect(generateQuiz(config, "custom topic")).rejects.toThrow("Falha na geração de conteúdo do quiz:");
    expect(logger.error).toHaveBeenCalled();
  });
});
