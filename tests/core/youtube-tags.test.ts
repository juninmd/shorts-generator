import { describe, it, expect } from "vitest";
import {
  sanitizeYoutubeTags,
  YOUTUBE_TAG_MAX_LENGTH,
  YOUTUBE_TAGS_MAX_BYTES,
} from "../../src/core/youtube-tags.js";

describe("sanitizeYoutubeTags", () => {
  it("drops non-string and empty entries", () => {
    expect(sanitizeYoutubeTags([42, null, "", "   ", "ok"])).toEqual(["ok"]);
  });

  it("removes characters YouTube rejects (emoji, CJK, control chars)", () => {
    expect(sanitizeYoutubeTags(["padre chrystian shankar舅舅", "fé 🙏", "a\tb"])).toEqual([
      "padre chrystian shankar",
      "fé",
      "a b",
    ]);
  });

  it("caps each tag at 30 characters without cutting words", () => {
    const tag = "como vencer batalhas espirituais";
    const [clean] = sanitizeYoutubeTags([tag]);
    expect(clean).toBe("como vencer batalhas");
    expect(clean!.length).toBeLessThanOrEqual(YOUTUBE_TAG_MAX_LENGTH);
  });

  it("cuts a long single word at the limit", () => {
    expect(sanitizeYoutubeTags(["a".repeat(40)])).toEqual(["a".repeat(YOUTUBE_TAG_MAX_LENGTH)]);
  });

  it("dedupes case-insensitively and collapses spaces", () => {
    expect(sanitizeYoutubeTags(["Shorts", "shorts", "  vida   cristã "])).toEqual(["Shorts", "vida cristã"]);
  });

  it("keeps the joined list within 500 bytes", () => {
    const tags = Array.from({ length: 40 }, (_, i) => `tag numero ${i}`);
    const clean = sanitizeYoutubeTags(tags);
    expect(Buffer.byteLength(clean.join(","), "utf8")).toBeLessThanOrEqual(YOUTUBE_TAGS_MAX_BYTES);
    expect(clean.length).toBeGreaterThan(0);
    expect(clean.length).toBeLessThan(tags.length);
  });
});
