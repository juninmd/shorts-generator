import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND } from "../../src/core/brand-template.js";
import { buildAssHeader } from "../../src/core/subtitle-header.js";
import { assInlineColor, assStyleColor } from "../../src/core/subtitle-format.js";
import { ctaEvent, hookEvent, lowerThirdEvent, wrapHook } from "../../src/core/subtitle-overlays.js";

describe("wrapHook", () => {
  it("wraps greedily and escapes ASS control characters", () => {
    expect(wrapHook("NASA's plan to help the trapped Chilean miners")).toBe("NASA's plan to help\\Nthe trapped Chilean\\Nminers");
    expect(wrapHook("{x}")).toBe("\\{x\\}");
  });

  it("ellipsises past three lines", () => {
    expect(wrapHook("um dois tres quatro cinco seis sete oito nove dez onze doze treze quatorze")).toMatch(/…$/);
    expect(wrapHook("um dois tres quatro cinco seis sete oito nove dez onze doze treze quatorze").split("\\N")).toHaveLength(3);
  });
});

describe("overlay events", () => {
  it("hook pops in over the first seconds on its own layer", () => {
    const line = hookEvent("Título", { ...DEFAULT_BRAND, hookSeconds: 3 });
    expect(line).toBe("Dialogue: 1,0:00:00.15,0:00:03.00,Hook,,0,0,0,,{\\fad(150,300)\\fscx92\\fscy92\\t(0,220,\\fscx100\\fscy100)}Título");
  });

  it("cta covers the final seconds and never starts before zero", () => {
    const brand = { ...DEFAULT_BRAND, cta: "Siga {já}", ctaSeconds: 2.5 };
    expect(ctaEvent(30, brand)).toContain("0:00:27.50,0:00:30.00,Cta");
    expect(ctaEvent(30, brand)).toContain("Siga \\{já\\}");
    expect(ctaEvent(1, brand)).toContain("0:00:00.00,0:00:01.00");
  });

  it("lower third slides the presenter name in at 72% of the height", () => {
    expect(lowerThirdEvent("Padre Paulo", 1920)).toBe("Dialogue: 1,0:00:00.90,0:00:04.60,LowerThird,,0,0,0,,{\\move(-500,1382,60,1382,0,350)\\fad(0,250)}Padre Paulo");
  });
});

describe("assembly of the ASS header", () => {
  it("follows the brand colours, font, scale and position", () => {
    const header = buildAssHeader("Linha1\nLinha2", 1080, 1920, {
      ...DEFAULT_BRAND, font: "Inter", textColor: "#102030", highlightColor: "#AABBCC", outlineColor: "#010203", fontScale: 0.5,
    });
    expect(header).toContain("Title: Linha1 Linha2");
    expect(header).toContain("Style: Default,Inter,65,&H00302010,&H000000FF,&H00030201,&H80000000,-1,0,0,0,100,100,1,0,1,4,3,2,50,50,614,1");
    expect(header).toContain("Style: Karaoke,Inter,65,&H00CCBBAA,&H00302010");
  });

  it("does not ask libass to embolden fonts that are already heavy", () => {
    const header = buildAssHeader("T", 1080, 1920, DEFAULT_BRAND);
    expect(header).toContain("Style: Default,Poppins ExtraBold,131,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,");
    expect(header).toMatch(/Style: Hook,Poppins ExtraBold,\d+,&H0000FFFF,&H000000FF,&HC8000000,&H00000000,0,/);
    expect(buildAssHeader("T", 1080, 1920, { ...DEFAULT_BRAND, font: "Inter Black" })).toContain(",Inter Black,131,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,");
    expect(buildAssHeader("T", 1080, 1920, { ...DEFAULT_BRAND, font: "Inter" })).toContain("Style: Default,Inter,131,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,");
  });

  it("centres captions vertically when asked", () => {
    const header = buildAssHeader("T", 1080, 1920, { ...DEFAULT_BRAND, captionPosition: "center" });
    expect(header).toContain(",5,50,50,0,1");
  });
});

describe("colour conversion", () => {
  it("converts #RRGGBB to ASS BGR forms", () => {
    expect(assStyleColor("#ff8a00")).toBe("&H00008AFF");
    expect(assInlineColor("#ff8a00")).toBe("&H008AFF&");
  });
});
