import { describe, it, expect } from "vitest";
import type { ComicChapter, ComicBook, NarratedChapter, ComicShortResult } from "../../../src/core/comic/comic-types.js";

describe("comic-types", () => {
  it("exports types correctly", () => {
    const chapter: ComicChapter = { id: "1", title: "Test", imagePath: "path", narrationText: "text" };
    expect(chapter).toBeDefined();

    const book: ComicBook = { id: "1", title: "Test Book", chapters: [chapter] };
    expect(book).toBeDefined();

    const narrated: NarratedChapter = { ...chapter, audioPath: "audio", durationSec: 10, words: [] };
    expect(narrated).toBeDefined();

    const result: ComicShortResult = { id: "1", bookTitle: "Test Book", outputPath: "out", subtitlePath: "sub", durationSec: 10, chapters: 1 };
    expect(result).toBeDefined();
  });
});
