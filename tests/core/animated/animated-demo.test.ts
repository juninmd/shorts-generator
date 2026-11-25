import { describe, it, expect } from "vitest";
import { buildAntonioCodeDemoBook } from "../../../src/core/animated/animated-demo.js";

describe("buildAntonioCodeDemoBook", () => {
  const book = buildAntonioCodeDemoBook();

  it("has unique chapters that each carry a heading, narration and an opening beat", () => {
    const ids = book.chapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chapter of book.chapters) {
      expect(chapter.heading.length).toBeGreaterThan(0);
      expect(chapter.narrationText.length).toBeGreaterThan(0);
      expect(chapter.beats.length).toBeGreaterThan(0);
    }
    expect(book.chapters[0]!.enter).toBe(true);
  });

  it("cues every beat on a word the narration actually speaks, so props land on the voice", () => {
    const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const chapter of book.chapters) {
      const words = fold(chapter.narrationText).split(/[^a-z0-9]+/);
      for (const beat of chapter.beats.filter((b) => b.cue)) {
        expect(words.some((w) => w.startsWith(fold(beat.cue!))), `${chapter.id}: ${beat.cue}`).toBe(true);
      }
    }
  });

  it("only changes the state of props that were introduced earlier in the chapter", () => {
    for (const chapter of book.chapters) {
      const ids = new Set<string>();
      for (const beat of chapter.beats) {
        if (beat.set) expect(ids.has(beat.set.id), `${chapter.id}: ${beat.set.id}`).toBe(true);
        if (beat.prop) ids.add(beat.id ?? beat.prop);
      }
    }
  });
});
