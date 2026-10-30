import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateQuiz } from "../../../src/core/quiz/quiz-content.service.js";
import { generateJsonObject } from "../../../src/core/generate-json.js";
import { logger } from "../../../src/core/logger.js";
import * as aiProvider from "../../../src/core/ai-provider.js";

vi.mock("../../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../../src/core/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../../../src/core/ai-provider.js", () => ({ createModel: vi.fn().mockReturnValue({}) }));

const config = { tempDir: "temp", outputDir: "out" } as any;

const question = (text: string, correct: "A" | "B" | "C" | "D" = "A") => ({
  pergunta: text,
  opcoes: { A: "um", B: "dois", C: "três", D: "quatro" },
  resposta_correta: correct,
});

const baseQuiz = () => ({
  tema: "futebol",
  titulo_youtube: "Só 1% acerta a 3ª de futebol",
  hook: "SÓ 1% ACERTA A 3ª",
  perguntas: [question("Primeira pergunta?"), question("Segunda pergunta?"), question("Terceira pergunta?", "C")],
  fato_curioso: "O Brasil é pentacampeão.",
  tags: ["futebol"],
});

const okAudit = (count = 3) => ({
  avaliacoes: Array.from({ length: count }, (_, indice) => ({
    indice, letra_correta: "A" as const, confianca: "alta" as const, qualidade: "ok" as const, motivo: "",
  })),
});

/** Each LLM call in order: `{ ok }` resolves, `{ fail }` rejects (with any value). */
type Step = { ok: unknown } | { fail: unknown };

function mockCalls(...steps: Step[]) {
  const mock = vi.mocked(generateJsonObject);
  for (const step of steps) {
    if ("fail" in step) mock.mockRejectedValueOnce(step.fail);
    else mock.mockResolvedValueOnce(step.ok);
  }
}

/** The text of the option the key points at — stable across the answer shuffle. */
const keyText = (quiz: any, index = 0) => quiz.perguntas[index].opcoes[quiz.perguntas[index].resposta_correta];

describe("quiz-content.service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(aiProvider, "createModel").mockReturnValue({} as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("generates a quiz about a custom topic", async () => {
    const quiz = baseQuiz();
    mockCalls({ ok: quiz }, { ok: okAudit() });

    const result = await generateQuiz(config, "custom topic");

    expect(result.perguntas.map((q: any) => q.pergunta)).toEqual(quiz.perguntas.map((q) => q.pergunta));
    expect(vi.mocked(generateJsonObject).mock.calls[0]![0].prompt).toContain("custom topic");
    // The audit runs blind: its prompt must not leak the declared answer.
    const auditPrompt = vi.mocked(generateJsonObject).mock.calls[1]![0].prompt;
    expect(auditPrompt).toContain("Primeira pergunta?");
    expect(auditPrompt).not.toContain("resposta_correta");
    expect(vi.mocked(generateJsonObject).mock.calls[1]![0]).toMatchObject({ attemptTimeoutMs: 30_000, maxRetries: 1 });
  });

  it("picks a topic when none is given", async () => {
    mockCalls({ ok: baseQuiz() }, { ok: okAudit() });
    const result = await generateQuiz(config);
    expect(result.perguntas).toHaveLength(3);
  });

  it("fills tema when the model omits it", async () => {
    const quiz = { ...baseQuiz(), tema: "" };
    mockCalls({ ok: quiz }, { ok: okAudit() });

    const result = await generateQuiz(config, "custom topic");

    expect(result.tema).toBe("custom topic");
  });

  it("fixes a wrong answer key when the blind audit disagrees with high confidence", async () => {
    const quiz = baseQuiz();
    const audit = {
      avaliacoes: [
        // The auditor says the right option is B ("dois"), the quiz declared A ("um").
        { indice: 0, letra_correta: "B", confianca: "alta", qualidade: "ok", motivo: "fato verificável" },
        { indice: 1, letra_correta: "A", confianca: "alta", qualidade: "ok", motivo: "" },
        { indice: 2, letra_correta: "A", confianca: "alta", qualidade: "ok", motivo: "" },
      ],
    };
    mockCalls({ ok: quiz }, { ok: audit });

    const result = await generateQuiz(config, "futebol");

    expect(keyText(result, 0)).toBe("dois");
    expect(logger.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("gabarito corrigido"));
  });

  it("drops a question the audit rejects and asks for a replacement", async () => {
    const quiz = baseQuiz();
    const audit = {
      avaliacoes: [
        { indice: 0, letra_correta: "A", confianca: "alta", qualidade: "ok", motivo: "" },
        { indice: 1, letra_correta: "B", confianca: "alta", qualidade: "incorreta", motivo: "o fato está errado" },
        { indice: 2, letra_correta: "C", confianca: "alta", qualidade: "ok", motivo: "" },
      ],
    };
    mockCalls({ ok: quiz }, { ok: audit }, { ok: { perguntas: [question("Pergunta substituta?", "D")] } });

    const result = await generateQuiz(config, "futebol");

    expect(result.perguntas.map((q: any) => q.pergunta)).toEqual([
      "Primeira pergunta?", "Terceira pergunta?", "Pergunta substituta?",
    ]);
    expect(logger.info).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("descartada pergunta 2"));
  });

  it("keeps going when the audit call fails", async () => {
    mockCalls({ ok: baseQuiz() }, { fail: new Error("audit offline") });

    const result = await generateQuiz(config, "futebol");

    expect(result.perguntas).toHaveLength(3);
    expect(logger.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("Auditoria"));
  });

  it("handles a non-error audit failure", async () => {
    mockCalls({ ok: baseQuiz() }, { fail: "offline" });

    const result = await generateQuiz(config, "futebol");

    expect(result.perguntas).toHaveLength(3);
    expect(logger.warn).toHaveBeenCalledWith({ error: "offline" }, expect.stringContaining("Auditoria"));
  });

  it("skips the audit when QUIZ_AUDIT=false", async () => {
    vi.stubEnv("QUIZ_AUDIT", "false");
    mockCalls({ ok: baseQuiz() }, { ok: okAudit() });

    await generateQuiz(config, "futebol");

    expect(generateJsonObject).toHaveBeenCalledTimes(1);
  });

  it("removes a duplicated question before rendering", async () => {
    vi.stubEnv("QUIZ_AUDIT", "false");
    const quiz = baseQuiz();
    quiz.perguntas[2] = { ...quiz.perguntas[0]!, pergunta: "Primeira pergunta?" };
    mockCalls({ ok: quiz }, { ok: okAudit() });

    const result = await generateQuiz(config, "futebol");

    expect(result.perguntas).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining("repete a pergunta 1"));
  });

  it("accepts fewer questions when no replacement arrives", async () => {
    const quiz = baseQuiz();
    const audit = {
      avaliacoes: [
        { indice: 0, letra_correta: "A", confianca: "alta", qualidade: "ok", motivo: "" },
        { indice: 1, letra_correta: "B", confianca: "alta", qualidade: "ambigua", motivo: "duas opções defensáveis" },
        { indice: 2, letra_correta: "C", confianca: "alta", qualidade: "ok", motivo: "" },
      ],
    };
    mockCalls({ ok: quiz }, { ok: audit }, { fail: "no replacements" });

    const result = await generateQuiz(config, "futebol");

    expect(result.perguntas).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledWith({ error: "no replacements" }, expect.stringContaining("substitutas"));
  });

  it("throws when generation fails", async () => {
    vi.mocked(generateJsonObject).mockRejectedValue(new Error("LLM failure"));
    await expect(generateQuiz(config, "custom topic")).rejects.toThrow("Falha na geração de conteúdo do quiz: LLM failure");
    expect(logger.error).toHaveBeenCalled();
  });

  it("throws when generation fails with a non-error value", async () => {
    vi.mocked(generateJsonObject).mockRejectedValue("string err");
    await expect(generateQuiz(config, "custom topic")).rejects.toThrow("Falha na geração de conteúdo do quiz:");
  });
});
