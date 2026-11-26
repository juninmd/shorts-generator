import { describe, expect, it } from "vitest";
import { AnimatedScriptSchema, parseAtomFeed, scriptToBook, styleForDate } from "../../../src/core/animated/animated-topic.js";
import { DAILY_PASSAGES, pickDailyPassage } from "../../../src/core/faceless/bible-daily.js";

const FEED = `<feed><entry><title>Radar dev 24/11</title><link rel="alternate" href="https://example.test/a"/>
<summary type="text">5 destaques &amp; mais</summary><category term="claude"/><category term="radar-dev"/></entry>
<entry><title>Radar dev 23/11</title><link href="https://example.test/b"/><summary>x</summary></entry></feed>`;

const words = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i}`).join(" ");
const script = (narration: string) => ({
  title: "Revise o código da IA",
  hashtags: ["ia"],
  chapters: [1, 2, 3, 4].map((n) => ({
    heading: `Regra ${n}`, emphasis: "Regra", narration,
    beats: [{ at: 0, pose: "talk" as const }, { cue: "palavra1", prop: "robot" as const, slot: "top" as const }, { cue: "inexistente", pose: "think" as const }],
  })),
});

describe("parseAtomFeed", () => {
  it("lê título, link, resumo e categorias", () => {
    const [first, second] = parseAtomFeed(FEED);
    expect(first).toEqual({ title: "Radar dev 24/11", link: "https://example.test/a", summary: "5 destaques & mais", categories: ["claude", "radar-dev"] });
    expect(second!.link).toBe("https://example.test/b");
  });
});

describe("styleForDate", () => {
  it("alterna pop e line em dias seguidos", () => {
    const a = styleForDate(new Date("2026-11-24T12:00:00Z"));
    const b = styleForDate(new Date("2026-11-25T12:00:00Z"));
    expect(new Set([a, b])).toEqual(new Set(["pop", "line"]));
  });
});

describe("AnimatedScriptSchema / scriptToBook", () => {
  it("rejeita narração curta demais", () => {
    expect(AnimatedScriptSchema.safeParse(script(words(5))).success).toBe(false);
  });
  it("aceita 90-170 palavras e troca cue ausente por posição proporcional", () => {
    const parsed = AnimatedScriptSchema.parse(script(words(30)));
    const book = scriptToBook(parsed, "t", "line");
    const beats = book.chapters[0]!.beats;
    expect(book.style).toBe("line");
    expect(beats[1]!.cue).toBe("palavra1");
    expect(beats[2]!.cue).toBeUndefined();
    expect(beats[2]!.at).toBeGreaterThan(0);
    expect(book.chapters[0]!.enter).toBe(true);
    expect(book.chapters[1]!.enter).toBeUndefined();
  });
});

describe("pickDailyPassage", () => {
  it("é determinístico no dia e percorre a lista", () => {
    const d = new Date("2026-11-24T12:00:00Z");
    expect(pickDailyPassage(d)).toBe(pickDailyPassage(new Date("2026-11-24T20:00:00Z")));
    const seen = new Set(Array.from({ length: DAILY_PASSAGES.length }, (_, i) => pickDailyPassage(new Date(d.getTime() + i * 86_400_000))));
    expect(seen.size).toBe(DAILY_PASSAGES.length);
  });
});
