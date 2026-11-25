import { describe, it, expect } from "vitest";
import { buildAntonioCodeDemoBook } from "../../../src/core/animated/animated-demo.js";

describe("buildAntonioCodeDemoBook", () => {
  it("is a pt-BR short where every chapter has a pose, a prop and narration", () => {
    const book = buildAntonioCodeDemoBook();
    const ids = book.chapters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const chapter of book.chapters) {
      expect(chapter.narrationText.length).toBeGreaterThan(0);
      expect(["idle", "talk", "point", "alarm", "typing"]).toContain(chapter.pose);
      expect(["none", "database", "warning", "shield"]).toContain(chapter.prop);
    }
    expect(book.chapters.map((c) => c.narrationText).join(" ")).toContain("guardrails");
  });
});
