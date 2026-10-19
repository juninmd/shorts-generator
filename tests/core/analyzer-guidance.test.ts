import { describe, expect, it } from "vitest";
import { buildGuidanceBlock, GENRE_GUIDANCE } from "../../src/core/analyzer-guidance.js";
import { buildAnalysisPrompt } from "../../src/core/analyzer-prompt.js";

describe("buildGuidanceBlock", () => {
  it("is empty without genre, request or hints", () => {
    expect(buildGuidanceBlock({})).toBe("");
  });

  it("uses the genre rules, case-insensitively", () => {
    const block = buildGuidanceBlock({ videoGenre: " Podcast " });
    expect(block).toContain(`GÊNERO DO VÍDEO (podcast): ${GENRE_GUIDANCE.podcast}`);
  });

  it("falls back to a generic line for unknown genres", () => {
    expect(buildGuidanceBlock({ videoGenre: "culinária" })).toContain('conteúdo do tipo "culinária"');
  });

  it("adds the editor's natural-language request and audio hints", () => {
    const block = buildGuidanceBlock({ clipPrompt: " momentos engraçados sobre dinheiro ", analysisHints: "SINAIS DE ÁUDIO: x\n" });
    expect(block).toContain('PEDIDO DO EDITOR: encontre APENAS momentos que atendam a: "momentos engraçados sobre dinheiro"');
    expect(block).toContain("SINAIS DE ÁUDIO: x");
  });

  it("covers every documented genre", () => {
    expect(Object.keys(GENRE_GUIDANCE)).toEqual(expect.arrayContaining(["podcast", "qa", "vlog", "listicle", "webinar", "sermon", "gaming", "sports", "news", "comedy"]));
  });
});

describe("analysis prompt", () => {
  it("asks for sub-scores, keywords and B-roll and carries the guidance", () => {
    const prompt = buildAnalysisPrompt("T", "Vídeo", "Canal", 1, 3, 15, 59, buildGuidanceBlock({ videoGenre: "qa" }));
    expect(prompt).toContain("SUBNOTAS");
    expect(prompt).toContain('"scoreBreakdown":{"hook":8');
    expect(prompt).toContain("KEYWORDS");
    expect(prompt).toContain("BROLL");
    expect(prompt).toContain("GÊNERO DO VÍDEO (qa)");
  });
});
