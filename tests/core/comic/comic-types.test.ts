import { describe, it, expect } from "vitest";
import type { ComicChapter, ComicBook, NarratedChapter, ComicShortResult } from "../../../src/core/comic/comic-types.js";

describe("comic-types", () => {
  it("exports types correctly", () => {
    const chapter: ComicChapter | null = null;
    const book: ComicBook | null = null;
    const narrated: NarratedChapter | null = null;
    const result: ComicShortResult | null = null;

    expect(chapter).toBeNull();
    expect(book).toBeNull();
    expect(narrated).toBeNull();
    expect(result).toBeNull();
  });
});
