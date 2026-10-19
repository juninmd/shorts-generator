import { describe, it, expect, afterEach } from "vitest";
import { generateASSSubtitles } from "../../src/core/subtitle.js";
import { karaokeEvents } from "../../src/core/subtitle-karaoke.js";
import { resolveSubtitleStyle } from "../../src/core/subtitle-format.js";
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
    expect(ass).toContain("Style: Karaoke,sans-serif,111,&H0000FFFF,&H00FFFFFF");
    expect(ass).toContain("{\\kf50}Olá");
    expect(ass).not.toContain("\\c&H00FFFF&");
  });

  it("falls back to word highlight when SUBTITLE_STYLE=highlight", () => {
    process.env.SUBTITLE_STYLE = "highlight";
    expect(resolveSubtitleStyle()).toBe("highlight");
    expect(generateASSSubtitles(clip)).toContain("\\c&H00FFFF&");
  });
});
