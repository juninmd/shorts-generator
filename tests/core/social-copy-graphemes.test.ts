import { describe, expect, it } from "vitest";
import { buildSocialCopy, truncateText } from "../../src/core/social-copy.js";

const isWellFormed = (s: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
const graphemeCount = (s: string) => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)).length;

describe("truncateText by grapheme", () => {
  it("never leaves half an emoji", () => {
    const out = truncateText("🔥".repeat(20), 10);
    expect(isWellFormed(out)).toBe(true);
    expect(out).toBe(`${"🔥".repeat(9)}…`);
  });

  it("keeps a ZWJ family emoji whole and counts it as one", () => {
    const family = "👨‍👩‍👧";
    expect(truncateText(family.repeat(3), 3)).toBe(family.repeat(3));
    expect(truncateText(family.repeat(5), 3)).toBe(`${family.repeat(2)}…`);
  });

  it("still cuts at a word boundary", () => {
    expect(truncateText("um dois três quatro cinco", 16)).toBe("um dois três…");
  });

  it("hard-cuts when the last space is too early", () => {
    expect(truncateText("a bcdefghijklmnop", 10)).toBe("a bcdefgh…");
  });

  it("produces Bluesky copy within 300 graphemes even with emoji", () => {
    const copy = buildSocialCopy("bluesky", { title: "🚀 ".repeat(200), description: "", tags: ["ia"] });
    expect(isWellFormed(copy.caption)).toBe(true);
    expect(graphemeCount(copy.caption)).toBeLessThanOrEqual(300);
  });
});
