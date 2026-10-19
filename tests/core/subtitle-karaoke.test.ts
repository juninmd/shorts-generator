import { describe, it, expect, afterEach } from "vitest";
import { generateASSSubtitles } from "../../src/core/subtitle.js";
import { karaokeEvents } from "../../src/core/subtitle-karaoke.js";
import { resolveSubtitleStyle } from "../../src/core/subtitle-format.js";
import { DEFAULT_BRAND } from "../../src/core/brand-template.js";
import type { ShortClip } from "../../src/types.js";

const clip = {
  title: "K",
  transcript: [],
  words: [
    { word: "Olá", start: 0, end: 0.4 },
    { word: "mundo", start: 0.5, end: 1.0 },
    { word: "{x}", start: 1.0, end: 1.2 },
  ],
} as unknown as ShortClip;

describe("karaoke subtitles", () => {
  afterEach(() => { delete process.env.SUBTITLE_STYLE; });

  it("sweeps each word until the next one starts and escapes ASS text", () => {
    const line = karaokeEvents(clip.words);
    expect(line).toContain("Karaoke,,0,0,0,,{\\fad(60,40)}{\\kf50}Olá {\\kf50}mundo {\\kf20}\\{x\\}");
    expect(line).toContain("0:00:00.00,0:00:01.20");
  });

  it("never emits a zero-length sweep", () => {
    expect(karaokeEvents([{ word: "a", start: 1, end: 1 }])).toContain("{\\kf1}a");
  });

  it("is the default style and defines Karaoke colours (yellow sweep over white)", () => {
    const ass = generateASSSubtitles(clip);
    expect(ass).toContain("Style: Karaoke,Poppins ExtraBold,131,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,1,0,1,7,3,2,50,50,614,1");
    expect(ass).toContain("{\\kf50}Olá");
    expect(ass).not.toContain("\\c&H00FFFF&");
  });

  it("falls back to word highlight when SUBTITLE_STYLE=highlight", () => {
    process.env.SUBTITLE_STYLE = "highlight";
    expect(resolveSubtitleStyle()).toBe("highlight");
    expect(generateASSSubtitles(clip)).toContain("\\c&H00FFFF&");
  });
});

describe("karaoke emphasis", () => {
  const words = [
    { word: "Só", start: 0, end: 0.4 },
    { word: "quatro", start: 0.5, end: 1.0 },
    { word: "dinheiro", start: 1.0, end: 1.4 },
    { word: "agora", start: 1.5, end: 2.0 },
  ];
  const brand = { ...DEFAULT_BRAND, emoji: true };
  const emphasis = new Set([words[1]!, words[2]!]);

  it("colours, enlarges and pops emphasised words, then resets the next word", () => {
    const line = karaokeEvents(words, { brand, emphasis });
    expect(line).toContain("{\\kf50}Só");
    expect(line).toContain("{\\kf50\\1c&H008AFF&\\fscx115\\fscy115\\t(500,620,\\fscx128\\fscy128)\\t(620,760,\\fscx115\\fscy115)}quatro");
    expect(line).toContain("{\\kf50\\1c&H008AFF&\\fscx115\\fscy115\\t(1000,1120,");
    expect(line).toContain("{\\kf50\\1c&H00FFFF&\\fscx100\\fscy100}agora");
  });

  it("appends the phrase emoji only when enabled", () => {
    expect(karaokeEvents(words, { brand, emphasis })).toMatch(/agora 💰$/);
    expect(karaokeEvents(words, { brand: { ...brand, emoji: false }, emphasis })).not.toContain("💰");
  });

  it("can disable the pop animation", () => {
    expect(karaokeEvents(words, { brand: { ...brand, pop: false }, emphasis })).not.toContain("\\t(");
  });
});

describe("generateASSSubtitles overlays", () => {
  afterEach(() => { delete process.env.CTA_TEXT; });

  it("adds the hook title, presenter tag and CTA from the brand template", () => {
    process.env.CTA_TEXT = "Siga!";
    const ass = generateASSSubtitles({ ...clip, presenter: "Ana", duration: 12, title: "Meu título" } as ShortClip);
    expect(ass).toContain(",Hook,,0,0,0,,");
    expect(ass).toContain("LowerThird,,0,0,0,,{\\move(");
    expect(ass).toContain("Cta,,0,0,0,,");
  });

  it("omits overlays when the template turns them off or the clip is too short for a CTA", () => {
    process.env.CTA_TEXT = "Siga!";
    const ass = generateASSSubtitles(
      { ...clip, duration: 5 } as ShortClip, 1080, 1920, undefined, "karaoke",
      { ...DEFAULT_BRAND, hook: false, cta: "Siga!" },
    );
    expect(ass).not.toContain(",Hook,,");
    expect(ass).not.toContain(",Cta,,");
    expect(ass).not.toContain("LowerThird,,");
  });
});
