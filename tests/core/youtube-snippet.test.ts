import { describe, expect, it } from "vitest";
import {
  sanitizeYoutubeDescription, sanitizeYoutubeTitle, YOUTUBE_DESCRIPTION_MAX_BYTES, YOUTUBE_TITLE_MAX_CHARS,
} from "../../src/core/youtube-snippet.js";

describe("sanitizeYoutubeTitle", () => {
  it("replaces angle brackets and folds whitespace", () => {
    expect(sanitizeYoutubeTitle("  Eu <3 isso\n a > b ")).toBe("Eu ‹3 isso a › b");
  });

  it("falls back when nothing is left", () => {
    expect(sanitizeYoutubeTitle(" \n ")).toBe("Shorts");
  });

  it("keeps a title within the limit untouched", () => {
    const title = "x".repeat(YOUTUBE_TITLE_MAX_CHARS);
    expect(sanitizeYoutubeTitle(title)).toBe(title);
  });

  it("cuts a long title at a word boundary with an ellipsis", () => {
    const title = `${"palavra ".repeat(20)}fim`;
    const out = sanitizeYoutubeTitle(title);
    expect(Array.from(out).length).toBeLessThanOrEqual(YOUTUBE_TITLE_MAX_CHARS);
    expect(out.endsWith("palavra…")).toBe(true);
  });

  it("never splits an emoji and hard-cuts a title without spaces", () => {
    const out = sanitizeYoutubeTitle("🔥".repeat(120));
    expect(Array.from(out)).toHaveLength(YOUTUBE_TITLE_MAX_CHARS);
    expect(out).toBe(`${"🔥".repeat(YOUTUBE_TITLE_MAX_CHARS - 1)}…`);
  });
});

describe("sanitizeYoutubeDescription", () => {
  it("replaces angle brackets and keeps short text", () => {
    expect(sanitizeYoutubeDescription("<b>oi</b>\nlinha")).toBe("‹b›oi‹/b›\nlinha");
  });

  it("caps at 5000 UTF-8 bytes without splitting a character", () => {
    const out = sanitizeYoutubeDescription("é".repeat(3000));
    expect(Buffer.byteLength(out, "utf8")).toBe(YOUTUBE_DESCRIPTION_MAX_BYTES);
    expect(out).toBe("é".repeat(2500));
    expect(Buffer.byteLength(sanitizeYoutubeDescription("😀".repeat(1300)), "utf8")).toBe(YOUTUBE_DESCRIPTION_MAX_BYTES);
  });
});
