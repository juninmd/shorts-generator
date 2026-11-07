import { describe, expect, it } from "vitest";
import { escapeHtmlWithin } from "../../src/core/telegram-formatting.js";

describe("escapeHtmlWithin", () => {
  it("escapes short text unchanged", () => {
    expect(escapeHtmlWithin("a & b", 50)).toBe("a &amp; b");
  });

  it("never cuts inside an entity", () => {
    const out = escapeHtmlWithin("&&&&&", 12);
    expect(out).toBe("&amp;&amp;…");
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it("never splits an emoji and trims before the ellipsis", () => {
    expect(escapeHtmlWithin("😀😀😀 fim de texto", 6)).toBe("😀😀…");
    expect(escapeHtmlWithin("ab cd ef", 5)).toBe("ab c…");
    expect(escapeHtmlWithin("ab cd ef", 4)).toBe("ab…");
  });

  it("returns nothing when there is no room", () => {
    expect(escapeHtmlWithin("texto", 0)).toBe("");
  });
});
