import { describe, expect, it } from "vitest";
import { buildBibleStickBook } from "../../../src/core/faceless/bible-stick.js";
import type { BibleScript } from "../../../src/core/faceless/bible-script.js";

const VERSE = "Levantou-se, pois, e foi para seu pai. Estando ele ainda longe, viu-o seu pai, e, compadecido, correu, abraçou-o e beijou-o.";
const script: BibleScript = {
  title: "O pai que correu",
  reference: "Lucas 15,20",
  scenes: [
    { act: "gancho", narration: "Você já esperou alguém voltar?", verse: VERSE, keywords: "x" },
    { act: "contexto", narration: "Um filho voltava para casa.", verse: "Levantou-se, pois, e foi para seu pai.", keywords: "x" },
    { act: "acontecimento", narration: "O pai o viu de longe.", verse: "viu-o seu pai, e, compadecido, correu", keywords: "x" },
    { act: "virada", narration: "Ele correu e o abraçou.", verse: "abraçou-o e beijou-o.", keywords: "x" },
    { act: "aplicacao", narration: "Deus age assim com quem volta.", verse: "Lucas 15,20", keywords: "x" },
  ],
} as BibleScript;

describe("buildBibleStickBook", () => {
  const book = buildBibleStickBook(script);

  it("keeps one chapter per scene in order, with the narration unchanged", () => {
    expect(book.chapters.map((c) => c.narrationText)).toEqual(script.scenes.map((s) => s.narration));
    expect(book.chapters[0]!.enter).toBe(true);
  });

  it("quotes each verse word for word on the scroll, never trimmed or paraphrased", () => {
    const first = book.chapters[0]!;
    const scroll = first.beats.find((b) => b.prop === "scroll")!;
    const shown = (scroll.lines ?? []).join(" ").replace(/[“”]/g, "").replace(/\s+/g, " ").trim();
    expect(shown).toBe(VERSE);
    expect(scroll.lines!.length).toBeLessThanOrEqual(8);
  });

  it("uses only props the renderer draws and the pt-BR act headings", () => {
    for (const chapter of book.chapters) {
      expect(chapter.heading.length).toBeGreaterThan(0);
      for (const beat of chapter.beats.filter((b) => b.prop)) expect(beat.prop).toBe("scroll");
    }
  });
});
