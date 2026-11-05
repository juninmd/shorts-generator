import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalPool } from "../../../src/core/sqlite-db.js";
import { runControlPlaneMigrations } from "../../../src/core/control-plane-migrations.js";
import { QuizBankRepository } from "../../../src/core/quiz/quiz-bank-repository.js";
import { prepareVerifiedQuiz } from "../../../src/core/quiz/quiz-sourcing.js";
import { anchorQuestion } from "../../../src/core/quiz/quiz-fact-check.js";
import { quizSchema, type Quiz } from "../../../src/core/quiz/quiz.domain.js";

vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const quiz: Quiz = {
  tema: "geografia",
  titulo_youtube: "Capitais que confundem todo mundo",
  hook: "VOCÊ SABE ESSAS?",
  perguntas: [
    { pergunta: "Qual é a capital da Austrália?", opcoes: { A: "Sydney", B: "Camberra", C: "Melbourne", D: "Perth" }, resposta_correta: "B" },
    { pergunta: "Qual é a capital do Canadá?", opcoes: { A: "Toronto", B: "Ottawa", C: "Montreal", D: "Vancouver" }, resposta_correta: "B" },
    { pergunta: "Qual é o maior oceano da Terra?", opcoes: { A: "Atlântico", B: "Índico", C: "Ártico", D: "Pacífico" }, resposta_correta: "D" },
  ],
  fato_curioso: "Camberra foi planejada para ser a capital.",
  tags: ["geografia", "capitais"],
};

const config = { managedRun: { runId: "r", channelId: "quiz-a", channelName: "Quiz A", focusLabels: [], editorial: { language: "pt-BR", allowedThemes: [], excludedThemes: ["política partidária"], tone: "", allowedFormats: ["quiz"], publishMode: "auto" } } } as any;
const verified = vi.fn(async (q: any) => ({ verified: true as const, source: { url: `https://pt.wikipedia.org/wiki/${q.opcoes[q.resposta_correta]}`, title: "t", excerpt: "e" } }));

describe("quiz schema limits", () => {
  it.each([
    ["pergunta longa", { ...quiz.perguntas[0], pergunta: "x".repeat(46) }],
    ["opção longa", { ...quiz.perguntas[0], opcoes: { ...quiz.perguntas[0]!.opcoes, A: "y".repeat(16) } }],
    ["opções repetidas normalizadas", { ...quiz.perguntas[0], opcoes: { A: "Sydney", B: "Camberra", C: "SYDNEY!", D: "Perth" } }],
    ["opção genérica", { ...quiz.perguntas[0], opcoes: { ...quiz.perguntas[0]!.opcoes, D: "Todas as anteriores" } }],
    ["resposta contida em outra opção", { ...quiz.perguntas[0], opcoes: { A: "Rio", B: "Rio Grande", C: "Recife", D: "Natal" }, resposta_correta: "A" }],
  ])("rejects %s before TTS/render", (_label, question) => {
    expect(quizSchema.safeParse({ ...quiz, perguntas: [question, quiz.perguntas[1], quiz.perguntas[2]] }).success).toBe(false);
  });

  it("requires exactly three questions and forbids unmeasured statistics", () => {
    expect(quizSchema.safeParse({ ...quiz, perguntas: quiz.perguntas.slice(0, 2) }).success).toBe(false);
    expect(quizSchema.safeParse({ ...quiz, hook: "SÓ 1% ACERTA" }).success).toBe(false);
    expect(quizSchema.safeParse({ ...quiz, titulo_youtube: "x".repeat(61) }).success).toBe(false);
    expect(quizSchema.safeParse({ ...quiz, hook: "x".repeat(23) }).success).toBe(false);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
  });
});

describe("prepareVerifiedQuiz", () => {
  let bank: QuizBankRepository;
  beforeEach(async () => {
    vi.clearAllMocks();
    const db = getLocalPool({ databaseUrl: "sqlite::memory:" });
    await runControlPlaneMigrations(db);
    bank = new QuizBankRepository(db);
  });

  it("returns a ready quiz with persisted provenance and records usage", async () => {
    const result = await prepareVerifiedQuiz(config, "geografia", { generate: vi.fn().mockResolvedValue(quiz), anchor: verified, bank });
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.provenance[0]).toContain("https://pt.wikipedia.org/wiki/Camberra");
    const stored = await bank.list("approved");
    expect(stored).toHaveLength(3);
    expect(stored.every((q) => q.source?.url.startsWith("https://"))).toBe(true);
    expect((await bank.recentlyUsed("quiz-a")).size).toBe(3);
  });

  it("holds the quiz when a question cannot be anchored and never invents a source", async () => {
    const anchor = vi.fn().mockResolvedValue({ verified: false, reason: "fonte indisponível: offline" });
    const result = await prepareVerifiedQuiz(config, "geografia", { generate: vi.fn().mockResolvedValue(quiz), anchor, bank, maxAttempts: 1 });
    expect(result.status).toBe("held");
    const pending = await bank.list("pending_review");
    expect(pending).toHaveLength(3);
    expect(pending.every((q) => q.source === null)).toBe(true);
  });

  it("blocks questions already used on the same channel, but not on another channel", async () => {
    await prepareVerifiedQuiz(config, "geografia", { generate: vi.fn().mockResolvedValue(quiz), anchor: verified, bank });
    const again = await prepareVerifiedQuiz(config, "geografia", { generate: vi.fn().mockResolvedValue(quiz), anchor: verified, bank, maxAttempts: 1 });
    expect(again.status).toBe("held");
    if (again.status === "held") expect(again.reasons.join(" ")).toContain("usadas recentemente");
    const other = { ...config, managedRun: { ...config.managedRun, channelId: "quiz-b" } };
    expect((await prepareVerifiedQuiz(other, "geografia", { generate: vi.fn().mockResolvedValue(quiz), anchor: verified, bank })).status).toBe("ready");
  });

  it("uses a human-approved bank entry without calling the anchor, and holds invalid LLM output", async () => {
    await bank.upsert("geografia", quiz.perguntas[0]!, "pending_review", "seed", null);
    const [entry] = await bank.list("pending_review");
    await bank.review(entry!.id, "approved", "admin");
    const anchor = vi.fn((q: any) => verified(q));
    await prepareVerifiedQuiz(config, "geografia", { generate: vi.fn().mockResolvedValue(quiz), anchor, bank });
    expect(anchor).toHaveBeenCalledTimes(2);

    const invalid = await prepareVerifiedQuiz(config, "x", { generate: vi.fn().mockResolvedValue({ ...quiz, perguntas: [] }), anchor, bank: null, maxAttempts: 1 });
    expect(invalid.status).toBe("held");
  });

  it("holds when the profile does not allow quizzes or the theme is excluded", async () => {
    const cutsOnly = { managedRun: { ...config.managedRun, editorial: { ...config.managedRun.editorial, allowedFormats: ["cuts"] } } };
    expect((await prepareVerifiedQuiz(cutsOnly as any, "x", { bank: null })).status).toBe("held");
    const political = { ...quiz, tema: "política partidária" };
    const result = await prepareVerifiedQuiz(config, "x", { generate: vi.fn().mockResolvedValue(political), anchor: verified, bank: null, maxAttempts: 1 });
    expect(result.status).toBe("held");
  });
});

describe("anchorQuestion (Wikipedia, injected fetcher)", () => {
  const q = quiz.perguntas[0]!;
  it("verifies when the summary names the answer, the question keywords and no competing option", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ pages: [{ key: "Camberra", title: "Camberra" }] })
      .mockResolvedValueOnce({ extract: "Camberra é a capital da Austrália.", content_urls: { desktop: { page: "https://pt.wikipedia.org/wiki/Camberra" } } });
    const result = await anchorQuestion(q, fetcher);
    expect(result).toEqual({ verified: true, source: { url: "https://pt.wikipedia.org/wiki/Camberra", title: "Camberra", excerpt: "Camberra é a capital da Austrália." } });
  });

  it("does not verify ambiguous or unavailable sources", async () => {
    const ambiguous = vi.fn()
      .mockResolvedValueOnce({ pages: [{ key: "Camberra", title: "Camberra" }] })
      .mockResolvedValueOnce({ extract: "Camberra é a capital da Austrália; Sydney é a maior cidade." });
    expect((await anchorQuestion(q, ambiguous)).verified).toBe(false);
    expect(await anchorQuestion(q, vi.fn().mockRejectedValue(new Error("offline")))).toEqual({ verified: false, reason: "fonte indisponível: offline" });
  });
});
