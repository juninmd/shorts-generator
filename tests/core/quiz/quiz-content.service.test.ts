import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateObject } from "ai";
import { generateQuiz } from "../../../src/core/quiz/quiz-content.service";
import { createModel } from "../../../src/core/ai-provider";
import { logger } from "../../../src/core/logger";

vi.mock("ai");
vi.mock("../../../src/core/ai-provider");
vi.mock("../../../src/core/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("Quiz Content Service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0); // Make Math.random deterministic (picks first topic: "jogos")
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should generate a quiz successfully", async () => {
    const mockModel = { id: "mock-model" };
    vi.mocked(createModel).mockReturnValue(mockModel as any);

    const mockQuiz = {
      tema: "jogos",
      pergunta: "Question?",
      opcoes: { A: "1", B: "2", C: "3", D: "4" },
      resposta_correta: "A",
      fato_curioso: "Fact"
    };

    vi.mocked(generateObject).mockResolvedValue({ object: mockQuiz } as any);

    const config = {} as any;
    const result = await generateQuiz(config);

    expect(createModel).toHaveBeenCalledWith(config);
    expect(generateObject).toHaveBeenCalledWith(expect.objectContaining({
      model: mockModel,
      prompt: expect.stringContaining("Gere um quiz sobre jogos"),
      system: expect.stringContaining("O tema selecionado é: jogos")
    }));
    expect(result).toEqual(mockQuiz);
  });

  it("should fallback to 'geral' if topics array is somehow empty/out of bounds", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // 1 * 8 = 8, topics[8] is undefined

    const mockQuiz = {
      pergunta: "Question?",
      opcoes: { A: "1", B: "2", C: "3", D: "4" },
      resposta_correta: "A",
      fato_curioso: "Fact"
    };

    vi.mocked(generateObject).mockResolvedValue({ object: mockQuiz } as any);

    const result = await generateQuiz({} as any);
    expect(generateObject).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining("Gere um quiz sobre geral"),
    }));
    expect(result.tema).toBe("geral"); // it sets the default topic if not returned
  });

  it("should log error and throw if generateObject fails", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("AI Error"));

    await expect(generateQuiz({} as any)).rejects.toThrow("Falha na geração de conteúdo do quiz: AI Error");
    expect(logger.error).toHaveBeenCalledWith({ error: "AI Error" }, "Erro na geração de conteúdo do quiz");
  });

  it("should handle error without message properly", async () => {
    vi.mocked(generateObject).mockRejectedValue("String Error");

    await expect(generateQuiz({} as any)).rejects.toThrow("Falha na geração de conteúdo do quiz: undefined");
    expect(logger.error).toHaveBeenCalledWith({ error: "String Error" }, "Erro na geração de conteúdo do quiz");
  });
});
