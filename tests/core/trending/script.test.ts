import { describe, it, expect } from "vitest";
import { buildRepoBook, firstSentences, narrationFor, safeBookId } from "../../../src/core/trending/script.js";
import type { TrendingRepo } from "../../../src/core/trending/github-trending.js";

const repo: TrendingRepo = {
  fullName: "Acme/Tool.X", description: "Makes things.", htmlUrl: "https://github.com/Acme/Tool.X",
  stars: 500, language: "Rust", defaultBranch: "main",
};
const img = (n: number, alt = "") => ({ alt, url: `https://h.test/${n}.png`, path: `/tmp/shot-${n}.png` });

describe("trending script", () => {
  it("keeps short prose and cuts long prose at a sentence end", () => {
    expect(firstSentences("Short.")).toBe("Short.");
    expect(firstSentences("One sentence. Two sentence here that goes on and on and on", 30)).toBe("One sentence.");
    expect(firstSentences("word ".repeat(20), 12)).toBe("word word.");
    expect(firstSentences("abcdefghijklmnop", 5)).toBe("abcde.");
  });

  it("narrates a screenshot from its section prose, else its alt text, else a fallback", () => {
    const shot = img(1, "Alt text");
    const sections = [{ heading: "S", text: "Prose here.", images: [{ alt: "", url: shot.url }] }];
    expect(narrationFor(shot, sections)).toBe("Prose here.");
    expect(narrationFor(shot, [{ heading: "", text: "", images: [{ alt: "", url: shot.url }] }])).toBe("Alt text");
    expect(narrationFor(img(2), [])).toBe("Veja a tela do projeto.");
  });

  it("makes filesystem-safe ids", () => {
    expect(safeBookId("Acme/Tool.X")).toBe("acme-tool-x");
  });

  it("builds intro, one chapter per screenshot and an outro", () => {
    const book = buildRepoBook(repo, [], [img(1, "A"), img(2)]);
    expect(book.id).toBe("acme-tool-x");
    expect(book.title).toBe("Tool.X");
    expect(book.chapters.map((c) => c.id)).toEqual(["intro", "shot-1", "shot-2", "outro"]);
    expect(book.chapters[0]?.narrationText).toBe("Projeto da semana: Tool.X. Makes things.");
    expect(book.chapters[3]?.imagePath).toBe("/tmp/shot-2.png");
    expect(book.chapters[3]?.narrationText).toContain(repo.htmlUrl);
  });

  it("omits a missing description and a slash-less name", () => {
    const book = buildRepoBook({ ...repo, fullName: "solo", description: null }, [], [img(1)]);
    expect(book.title).toBe("solo");
    expect(book.chapters[0]?.narrationText).toBe("Projeto da semana: solo.");
  });

  it("refuses to build a book without screenshots", () => {
    expect(() => buildRepoBook(repo, [], [])).toThrow("No README images");
  });
});
