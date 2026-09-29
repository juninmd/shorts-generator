import { describe, it, expect } from "vitest";
import type { ComicChapter, ComicBook, NarratedChapter, ComicShortResult } from "../../../src/core/comic/comic-types.js";

describe("comic-types", () => {
  it("dummy test for types", () => {
    const _ch: ComicChapter | null = null;
    const _book: ComicBook | null = null;
    const _nch: NarratedChapter | null = null;
    const _res: ComicShortResult | null = null;
    expect(_ch).toBeNull();
    expect(_book).toBeNull();
    expect(_nch).toBeNull();
    expect(_res).toBeNull();
  });
});
