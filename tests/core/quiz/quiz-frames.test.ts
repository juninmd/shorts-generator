import { describe, expect, it } from "vitest";
import { buildFrameFilters, questionFontSize, type FrameAssets } from "../../../src/core/quiz/quiz-frames.js";
import { buildTimeline, type Quiz } from "../../../src/core/quiz/quiz.domain.js";

const quiz: Quiz = {
  tema: "futebol",
  titulo_youtube: "Só 1% acerta a 3ª de futebol",
  hook: "SÓ 1% ACERTA A 3ª",
  perguntas: [
    { pergunta: "P1?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "B" },
    { pergunta: "P2?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "A" },
  ],
  fato_curioso: "Fato.",
  tags: ["futebol"],
};

const assets: FrameAssets = {
  fontFile: "font.ttf",
  textFiles: quiz.perguntas.map((_, i) => ({
    qTxtPath: `q${i}.txt`,
    qLinePaths: [`q${i}_l0.txt`, `q${i}_l1.txt`],
    optTxtPaths: { A: `a${i}.txt`, B: `b${i}.txt`, C: `c${i}.txt`, D: `d${i}.txt` },
  })),
  outroTxtPath: "outro.txt",
  outroLinePaths: ["outro_l0.txt"],
  hookTxtPath: "hook.txt",
  hasLogo: false,
  logoIdx: -1,
  watermarkText: "@akitemquiz",
};

const timeline = buildTimeline([3, 3], [2, 2], 5);
const word = (letter: string) => letter.repeat(20);

describe("quiz frames", () => {
  it("uses the largest type for a short question", () => {
    expect(questionFontSize("Quem?")).toBe(56);
  });

  it("shrinks the type as the question wraps to more lines", () => {
    expect(questionFontSize(`${word("a")} ${word("b")} ${word("c")}`)).toBe(48);
    expect(questionFontSize(`${word("a")} ${word("b")} ${word("c")} ${word("d")}`)).toBe(42);
  });

  it("builds the picture chain up to [vout] with the text panel", () => {
    const filters = buildFrameFilters(quiz, timeline, assets);
    expect(filters[0]).toContain("[0:v]scale=1080:1920");
    expect(filters.join(";")).toContain("drawbox=x=36:y=360");
    expect(filters.join(";")).toContain("PERGUNTA 2/2");
    expect(filters.at(-1)).toMatch(/\[v\d+\]copy\[vout\]/);
    expect(filters.join(";")).not.toContain("overlay=");
  });

  it("skips the generic panel when the art already provides one", () => {
    const withArt = buildFrameFilters(quiz, timeline, { ...assets, hasPanel: true });
    const chain = withArt.join(";");
    expect(chain).not.toContain("drawbox=x=36");
    expect(withArt[1]).toBe("[vbg]copy[vpanel]");
    // the countdown moves inside the art's text area
    expect(chain).toContain("x=w-text_w-170:y=700");
    // branding goes above the art's panel border, not over it
    expect(chain).toContain("x=40:y=96");
  });

  it("places the logo and shifts the watermark when a logo is present", () => {
    const withLogo = buildFrameFilters(quiz, timeline, { ...assets, hasLogo: true, logoIdx: 8 });
    const chain = withLogo.join(";");
    expect(chain).toContain("[8:v]scale=120:-1[logo_scaled]");
    expect(chain).toContain("overlay=40:150[vlogo]");
    expect(chain).toContain("x=180:y=176");
  });

  it("keeps logo and watermark above the panel on art backgrounds", () => {
    const withArt = buildFrameFilters(quiz, timeline, { ...assets, hasLogo: true, logoIdx: 8, hasPanel: true });
    const chain = withArt.join(";");
    expect(chain).toContain("overlay=40:96[vlogo]");
    expect(chain).toContain("x=180:y=122");
  });
});
