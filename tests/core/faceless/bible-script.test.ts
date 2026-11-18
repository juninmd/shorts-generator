import { describe, expect, it, vi } from "vitest";
import { BIBLE_ACTS, BibleScriptSchema, PROMPT_ACTS, generateBibleScript } from "../../../src/core/faceless/bible-script.js";
import { buildBibleMeta } from "../../../src/core/faceless/bible-meta.js";
import { generateJsonObject } from "../../../src/core/generate-json.js";

vi.mock("../../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../../src/core/ai-provider.js", () => ({ createModel: vi.fn(() => "model") }));

const scene = (act: (typeof BIBLE_ACTS)[number], n = 1) => ({
  act, narration: `Narração ${act} ${n} ${"palavra ".repeat(18)}`, verse: `Versículo ${act}`, keywords: "desert road",
});
const validScenes = BIBLE_ACTS.map((act) => scene(act));
const script = { title: "O Filho Pródigo", reference: "Lucas 15,11-24", scenes: validScenes };

describe("BibleScriptSchema", () => {
  it("accepts a full arc in order, with repeated acts allowed", () => {
    expect(BibleScriptSchema.safeParse(script).success).toBe(true);
    const repeated = [...validScenes.slice(0, 3), scene("acontecimento", 2), ...validScenes.slice(3)];
    expect(BibleScriptSchema.safeParse({ ...script, scenes: repeated }).success).toBe(true);
  });

  it("rejects acts out of order, missing acts, or a wrong first/last act", () => {
    const swapped = [validScenes[0]!, validScenes[2]!, validScenes[1]!, validScenes[3]!, validScenes[4]!];
    expect(BibleScriptSchema.safeParse({ ...script, scenes: swapped }).success).toBe(false);
    const missing = [validScenes[0]!, validScenes[1]!, validScenes[2]!, validScenes[4]!, scene("aplicacao", 2)];
    expect(BibleScriptSchema.safeParse({ ...script, scenes: missing }).success).toBe(false);
    expect(BibleScriptSchema.safeParse({ ...script, scenes: validScenes.slice(0, 4) }).success).toBe(false);
  });

  it("rejects a narration too short to fill a Short", () => {
    const short = validScenes.map((s) => ({ ...s, narration: "curta" }));
    expect(BibleScriptSchema.safeParse({ ...script, scenes: short }).success).toBe(false);
  });

  it("rejects an overlong on-screen verse", () => {
    const long = validScenes.map((s, i) => (i === 0 ? { ...s, verse: "x".repeat(141) } : s));
    expect(BibleScriptSchema.safeParse({ ...script, scenes: long }).success).toBe(false);
  });
});

describe("generateBibleScript", () => {
  const cfg = { aiModel: "m", litellmApiKey: "k", litellmBaseUrl: "u" };

  it("asks for a faithful, act-ordered retelling of the passage", async () => {
    vi.mocked(generateJsonObject).mockResolvedValue(script);
    expect(await generateBibleScript("Lucas 15,11-24", cfg)).toBe(script);
    const options = vi.mocked(generateJsonObject).mock.calls[0]![0];
    expect(options.prompt).toContain('"Lucas 15,11-24"');
    expect(options.prompt).toContain("Idioma: pt-BR");
    expect(options.prompt).toContain("não invente");
    expect(options.prompt).toContain("EXATAMENTE 6 cenas");
    expect(options.prompt).toContain("gancho, contexto, acontecimento, acontecimento, virada, aplicacao");
    expect(options.prompt).toContain("a cena de virada é obrigatória");
    expect(BibleScriptSchema.safeParse({ ...script, scenes: PROMPT_ACTS.map((act) => scene(act)) }).success).toBe(true);
    await generateBibleScript("x", cfg, "en-US");
    expect(vi.mocked(generateJsonObject).mock.calls[1]![0].prompt).toContain("Idioma: en-US");
  });
});

describe("buildBibleMeta", () => {
  const links = [
    { name: "Bíblia Ave-Maria", url: "https://link.amazon/a" },
    { name: "Terço", url: "https://link.amazon/b" },
  ];

  it("puts the affiliate links in the description and in the pinned comment", () => {
    const meta = buildBibleMeta(script, "/out/v.mp4", 52, {
      managedRun: { runId: "r", channelId: "santidade-catolica", channelName: "S", focusLabels: ["Católicos"], affiliateLinks: links },
    } as any);
    expect(meta.channelId).toBe("santidade-catolica");
    expect(meta.title).toBe("O Filho Pródigo | Lucas 15,11-24");
    expect(meta.description).toContain("📖 Passagem: Lucas 15,11-24");
    expect(meta.description).toContain("#biblia");
    expect(meta.description.endsWith("Como Associado da Amazon, eu ganho com compras qualificadas.")).toBe(true);
    expect(meta.commentText).toContain("Para sua caminhada de fé:");
    expect(meta.commentText).toContain("https://link.amazon/");
    expect(meta.tags).toContain("bíblia");
    expect(meta.tags).toContain("Lucas 15 11-24");
  });

  it("works without a managed channel or links", () => {
    const meta = buildBibleMeta(script, "/out/v.mp4", 52, {} as any);
    expect(meta.channelId).toBe("global");
    expect(meta.description).not.toContain("🛒");
    expect(meta.commentText).not.toContain("🛒");
  });
});
