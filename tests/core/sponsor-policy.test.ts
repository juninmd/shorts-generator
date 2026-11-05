import { describe, expect, it } from "vitest";
import { dropSponsoredClips, looksSponsored } from "../../src/core/sponsor-policy.js";
import type { Transcript } from "../../src/types.js";

describe("sponsor policy", () => {
  it("needs two distinct cues so one stray word is not an ad", () => {
    expect(looksSponsored("Esse vídeo tem patrocínio.")).toBe(false);
    expect(looksSponsored("Use o código FÉ no link na descrição")).toBe(true);
  });

  it("drops only the clips whose own transcript reads as an ad", () => {
    const transcript = {
      segments: [
        { start: 0, end: 10, text: "Cupom de desconto e link na descrição" },
        { start: 20, end: 30, text: "A disciplina vence" },
      ],
    } as Transcript;
    const base = { description: "", startTime: 0, endTime: 10, viralScore: 8, reason: "", hashtags: [] };
    const ad = { ...base, title: "Ad" };
    const good = { ...base, title: "Bom", startTime: 20, endTime: 30 };
    expect(dropSponsoredClips([ad, good], transcript)).toEqual([good]);
  });
});
