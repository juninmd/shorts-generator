import { beforeEach, describe, expect, it, vi } from "vitest";
import { repairClipCandidates } from "../../src/core/clip-repair.js";
import * as gjModule from "../../src/core/generate-json.js";
import type { PipelineConfig, Transcript } from "../../src/types.js";

vi.mock("../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../src/core/ai-provider.js", () => ({
  createModel: vi.fn(() => ({ id: "mock" })),
}));

const transcript = {
  videoId: "repair",
  duration: 40,
  language: "pt",
  fullText: "A verdade liberta.",
  words: [],
  segments: [{ start: 0, end: 20, text: "A verdade liberta." }],
} as Transcript;
const clip = {
  title: "Corte",
  startTime: 0,
  endTime: 20,
  viralScore: 8,
  description: "D",
  reason: "R",
  hashtags: [],
};
const config = { minShortDuration: 15, maxShortDuration: 59 } as PipelineConfig;

describe("clip repair", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns immediately without candidates", async () => {
    await expect(repairClipCandidates([], transcript, config, 1)).resolves.toEqual([]);
    expect(gjModule.generateJsonObject).not.toHaveBeenCalled();
  });

  it("accepts an empty structured repair response", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({} as never);
    await expect(repairClipCandidates([clip], transcript, config, 1)).resolves.toEqual([]);
  });

  it("fails closed when repair generation fails", async () => {
    vi.mocked(gjModule.generateJsonObject).mockRejectedValue(new Error("offline"));
    await expect(repairClipCandidates([clip], transcript, config, 1)).resolves.toEqual([]);
  });

  const repaired = (extra = {}) => ({ ...clip, startTime: 0, endTime: 30, ...extra });

  it("voids repairs whose cited quote is not in the transcript", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({ clips: [
      repaired({ title: "Inventada", diagnosis: { check: "completeEnding", quote: "frase inventada" } }),
      repaired({ title: "Real", diagnosis: { check: "completeEnding", quote: "A VERDADE liberta." } }),
      repaired({ title: "Sem citação" }),
    ] } as never);
    const result = await repairClipCandidates([clip], transcript, config, 3);
    expect(result.map((item) => item.title)).toEqual(["Real", "Sem citação"]);
  });

  it("drops proposals that overlap approved footage and shows gaps and reasons", async () => {
    vi.mocked(gjModule.generateJsonObject).mockResolvedValue({ clips: [
      repaired({ title: "Repetida" }), repaired({ title: "Nova", startTime: 25, endTime: 40 }),
    ] } as never);
    const result = await repairClipCandidates([clip], transcript, config, 3, {
      reasons: [{ title: "Corte", reason: "payoff cortado" }],
      gaps: [{ startTime: 20, endTime: 40 }],
      exclude: [{ startTime: 0, endTime: 30 }],
    });
    expect(result.map((item) => item.title)).toEqual(["Nova"]);
    const prompt = vi.mocked(gjModule.generateJsonObject).mock.calls[0]![0].prompt;
    expect(prompt).toContain("payoff cortado");
    expect(prompt).toContain("LACUNAS");
    expect(prompt).toContain("TRECHOS JÁ APROVADOS");
  });
});
