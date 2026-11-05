import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineConfig, Transcript } from "../../src/types.js";
import * as gjModule from "../../src/core/generate-json.js";
import { reviewClipCandidates } from "../../src/core/clip-quality.js";

vi.mock("../../src/core/generate-json.js", () => ({
  generateJsonObject: vi.fn(),
}));

vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn().mockReturnValue({ id: "mock-model" }),
}));

describe("clip-quality", () => {
  const config = {
    aiTimeoutMs: 300_000,
    minViralScore: 7,
  } as PipelineConfig;
  const transcript: Transcript = {
    videoId: "video-1",
    duration: 90,
    language: "pt",
    fullText: "",
    words: [],
    segments: [
      { start: 0, end: 20, text: "Hoje eu vou contar uma verdade." },
      { start: 20, end: 50, text: "A disciplina vence a motivação todos os dias." },
      { start: 50, end: 80, text: "É assim que você termina o que começou." },
    ],
  };

  beforeEach(() => vi.clearAllMocks());

  it("drops a self-scored viral candidate when the editorial review rejects its hook", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({
      reviews: [{
        candidateIndex: 0,
        editorialScore: 5,
        hookScore: 4,
        standaloneScore: 8,
        payoffScore: 8,
        approved: false,
        reason: "Começa com introdução genérica.",
      }],
    } as never);

    const result = await reviewClipCandidates([{
      title: "Uma verdade que muda tudo para você hoje",
      presenter: "",
      description: "Desc",
      contentValue: "Reflexão",
      hookText: "Hoje eu vou contar uma verdade.",
      payoffText: "É assim que você termina o que começou.",
      startTime: 0,
      endTime: 50,
      viralScore: 10,
      reason: "Suposto gancho forte",
      hashtags: ["#disciplina"],
    }], transcript, config);

    expect(result).toEqual([]);
    const prompt = vi.mocked(gjModule.generateJsonObject).mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("Gancho literal: Hoje eu vou contar uma verdade.");
    expect(prompt).toContain("Payoff literal: É assim que você termina o que começou.");
    expect(prompt).toContain("erros de transcrição");
  });

  it("ranks approved candidates by the independent editorial score", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({
      reviews: [
        { candidateIndex: 0, editorialScore: 7, hookScore: 7, standaloneScore: 8, payoffScore: 8, approved: true, reason: "Bom." },
        { candidateIndex: 1, editorialScore: 9, hookScore: 9, standaloneScore: 9, payoffScore: 9, approved: true, reason: "Excelente." },
      ],
    } as never);
    const base = {
      presenter: "",
      description: "Desc",
      contentValue: "Reflexão",
      reason: "Primeira análise",
      hashtags: ["#disciplina"],
    };

    const result = await reviewClipCandidates([
      { ...base, title: "A", startTime: 0, endTime: 20, viralScore: 10 },
      { ...base, title: "B", startTime: 20, endTime: 50, viralScore: 7 },
    ], transcript, config);

    expect(result.map((clip) => [clip.title, clip.viralScore])).toEqual([["B", 9], ["A", 7]]);
    expect(result[0]?.reason).toBe("Excelente.");
  });

  it("fails closed when the editorial review cannot be validated", async () => {
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(
      new Error("JSON did not match review schema"),
    );

    const result = await reviewClipCandidates([{
      title: "Uma nota inicial alta não basta para publicar",
      presenter: "",
      description: "Desc",
      contentValue: "Reflexão",
      startTime: 0,
      endTime: 50,
      viralScore: 10,
      reason: "Primeira análise",
      hashtags: ["#qualidade"],
    }], transcript, config);

    expect(result).toEqual([]);
  });

  describe("editorial veto (structural heuristic is auxiliary only)", () => {
    const rejected = {
      candidateIndex: 0, editorialScore: 6, hookScore: 8, standaloneScore: 8, payoffScore: 4,
      approved: false, reason: "Payoff truncado.",
    };
    const strongTranscript: Transcript = {
      ...transcript,
      duration: 404,
      segments: [
        { start: 389, end: 398, text: "Não. A verdade vai doer, mas vai libertar. Ela vai salvar." },
        { start: 399, end: 404, text: "Não tenha medo. Ele fere para curar." },
      ],
    };
    const candidate = () => [{
      title: "A verdade dói, liberta e cura",
      description: "Desc",
      contentValue: "Reflexão",
      hookText: strongTranscript.segments[0]!.text,
      payoffText: strongTranscript.segments[1]!.text,
      startTime: 389,
      endTime: 404,
      viralScore: 8.5,
      reason: "Transformação clara",
      hashtags: [],
    }];

    it("does not publish an explicitly rejected clip when the second opinion also rejects", async () => {
      const record = vi.fn().mockResolvedValue(undefined);
      vi.mocked(gjModule.generateJsonObject)
        .mockResolvedValueOnce({ reviews: [rejected] } as never)
        .mockResolvedValueOnce({ reviews: [{ ...rejected, reason: "Continua truncado." }] } as never);

      const result = await reviewClipCandidates(candidate(), strongTranscript, config, { record });

      expect(result).toHaveLength(0);
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ decision: "reevaluated_rejected", reasons: ["Payoff truncado.", "Continua truncado."] }));
    });

    it("keeps a traceable result when the limited re-evaluation legitimately approves", async () => {
      const record = vi.fn().mockResolvedValue(undefined);
      vi.mocked(gjModule.generateJsonObject)
        .mockResolvedValueOnce({ reviews: [rejected] } as never)
        .mockResolvedValueOnce({ reviews: [{ ...rejected, editorialScore: 8, payoffScore: 8, approved: true, reason: "Payoff completo." }] } as never);

      const result = await reviewClipCandidates(candidate(), strongTranscript, config, { record });

      expect(result).toHaveLength(1);
      expect(result[0]!.viralScore).toBe(8);
      expect(result[0]!.requiresHumanReview).toBeUndefined();
      expect(result[0]!.editorialNotes).toContain("Payoff truncado.");
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ decision: "reevaluated_approved" }));
    });

    it("routes the divergence to human review when the re-evaluation fails", async () => {
      vi.mocked(gjModule.generateJsonObject)
        .mockResolvedValueOnce({ reviews: [rejected] } as never)
        .mockRejectedValueOnce(new Error("litellm down"));

      const result = await reviewClipCandidates(candidate(), strongTranscript, config, { record: vi.fn().mockResolvedValue(undefined) });

      expect(result).toHaveLength(1);
      expect(result[0]!.requiresHumanReview).toBe(true);
    });

    it("never approves when the review omits the candidate or errors", async () => {
      vi.mocked(gjModule.generateJsonObject).mockResolvedValueOnce({ reviews: [] } as never);
      expect(await reviewClipCandidates(candidate(), strongTranscript, config, { record: vi.fn().mockResolvedValue(undefined) })).toHaveLength(0);
      vi.mocked(gjModule.generateJsonObject).mockRejectedValueOnce(new Error("timeout"));
      expect(await reviewClipCandidates(candidate(), strongTranscript, config, { record: vi.fn().mockResolvedValue(undefined) })).toHaveLength(0);
    });

    it("retains an approved clip whose theme is excluded by the channel profile", async () => {
      vi.mocked(gjModule.generateJsonObject).mockResolvedValueOnce({ reviews: [{ ...rejected, editorialScore: 9, payoffScore: 9, approved: true }] } as never);
      const profiled = { ...config, managedRun: { runId: "r", channelId: "c", channelName: "C", focusLabels: [], editorial: { language: "pt-BR", allowedThemes: [], excludedThemes: ["verdade"], tone: "", allowedFormats: ["cuts"], publishMode: "auto" } } } as PipelineConfig;
      const record = vi.fn().mockResolvedValue(undefined);

      expect(await reviewClipCandidates(candidate(), strongTranscript, profiled, { record })).toHaveLength(0);
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ decision: "rejected", reasons: ["tema excluído: verdade"] }));
    });
  });
});
