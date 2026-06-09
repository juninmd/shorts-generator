import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateQuiz } from "../../../src/core/quiz/quiz-content.service.js";
import * as aiProvider from "../../../src/core/ai-provider.js";
import * as aiModule from "ai";
import { logger } from "../../../src/core/logger.js";
import type { PipelineConfig } from "../../../src/types.js";

vi.mock("../../../src/core/ai-provider.js");
vi.mock("ai");
vi.mock("../../../src/core/logger.js", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("quiz-content.service", () => {
  const mockConfig: PipelineConfig = {
    aiModel: "test-model",
  } as PipelineConfig;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a quiz successfully and add topic if missing", async () => {
    const mockQuizResponse = {
      pergunta: "Test Question",
      opcoes: { A: "1", B: "2", C: "3", D: "4" },
      correta: "A",
      explicacao: "Test Explanation",
    };

    vi.mocked(aiProvider.createModel).mockReturnValue({} as any);
    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: mockQuizResponse,
    } as any);

    const quiz = await generateQuiz(mockConfig);
    expect(quiz.pergunta).toBe("Test Question");
    expect(quiz.tema).toBeDefined();
    expect(aiModule.generateObject).toHaveBeenCalled();
  });

  it("should return the quiz with existing topic", async () => {
    const mockQuizResponse = {
      tema: "Specific Topic",
      pergunta: "Test Question",
      opcoes: { A: "1", B: "2", C: "3", D: "4" },
      correta: "A",
      explicacao: "Test Explanation",
    };

    vi.mocked(aiProvider.createModel).mockReturnValue({} as any);
    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: mockQuizResponse,
    } as any);

    const quiz = await generateQuiz(mockConfig);
    expect(quiz.tema).toBe("Specific Topic");
  });

  it("should throw error on generation failure and log it", async () => {
    const error = new Error("Generation Failed");
    vi.mocked(aiProvider.createModel).mockReturnValue({} as any);
    vi.mocked(aiModule.generateObject).mockRejectedValue(error);

    await expect(generateQuiz(mockConfig)).rejects.toThrow("Falha na geração de conteúdo do quiz: Generation Failed");
    expect(logger.error).toHaveBeenCalledWith({ error: "Generation Failed" }, "Erro na geração de conteúdo do quiz");
  });

   it("should handle error without message", async () => {
    const error = "Simple String Error";
    vi.mocked(aiProvider.createModel).mockReturnValue({} as any);
    vi.mocked(aiModule.generateObject).mockRejectedValue(error);

    await expect(generateQuiz(mockConfig)).rejects.toThrow("Falha na geração de conteúdo do quiz: undefined");
    expect(logger.error).toHaveBeenCalledWith({ error: "Simple String Error" }, "Erro na geração de conteúdo do quiz");
  });

  it("should randomly select a topic (coverage for random selection)", async () => {
     vi.spyOn(Math, 'random').mockReturnValue(0.99); // Force selection of last topic or undefined

     const mockQuizResponse = {
      pergunta: "Q?",
      opcoes: { A: "1", B: "2", C: "3", D: "4" },
      correta: "A",
      explicacao: "E",
    };

    vi.mocked(aiProvider.createModel).mockReturnValue({} as any);
    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: mockQuizResponse,
    } as any);

    const quiz = await generateQuiz(mockConfig);
    expect(quiz.tema).toBeDefined(); // Can be "ciência" or "geral" depending on length vs index

    vi.spyOn(Math, 'random').mockRestore();
  });
});
