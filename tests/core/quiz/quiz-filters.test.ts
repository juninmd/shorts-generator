import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFilters } from "../../../src/core/quiz/quiz-filters.service.js";

vi.mock("../../../src/core/quiz/quiz-assets.service.js", () => ({
  esc: (p: string) => p,
  normalizePath: (p: string) => p
}));

describe("quiz-filters.service", () => {
  const defaultQuiz = {
    tema: "T", pergunta: "Q", opcoes: { A: "1", B: "2", C: "3", D: "4" },
    correta: "A", explicacao: "E", resposta_correta: "A"
  } as any;

  it("should generate filters for video background", () => {
    const result = generateFilters(
      defaultQuiz,
      "bg.mp4",
      "q.mp3",
      "a.mp3",
      10,
      "font.ttf",
      "q.txt",
      { A: "a.txt", B: "b.txt", C: "c.txt", D: "d.txt" },
      true, // hasMusic
      true, // hasBeep
      true, // hasLogo
      "music.mp3",
      "beep.mp3",
      "logo.png",
      "@watermark"
    );

    expect(result.ffmpegInputs).toContain("-stream_loop");
    expect(result.ffmpegInputs).toContain("bg.mp4");
    expect(result.ffmpegInputs).toContain("beep.mp3");
    expect(result.ffmpegInputs).toContain("music.mp3");
    expect(result.ffmpegInputs).toContain("logo.png");

    expect(result.filterComplex).toContain("scale=150:-1");
    expect(result.filterComplex).toContain("overlay=40:40"); // Logo
    expect(result.filterComplex).toContain("watermark");
  });

  it("should generate filters for image background", () => {
    const result = generateFilters(
      defaultQuiz,
      "bg.jpg",
      "q.mp3",
      "a.mp3",
      10,
      "font.ttf",
      "q.txt",
      { A: "a.txt" },
      false, // hasMusic
      false, // hasBeep
      false, // hasLogo
      "",
      "",
      "",
      "@watermark"
    );

    expect(result.ffmpegInputs).toContain("-loop");
    expect(result.ffmpegInputs).toContain("bg.jpg");
    expect(result.ffmpegInputs).not.toContain("logo.png");

    expect(result.filterComplex).not.toContain("scale=150:-1"); // No logo scaling
    expect(result.filterComplex).toContain("watermark");
  });

  it("should highlight correct answer with box", () => {
    const result = generateFilters(
      { ...defaultQuiz, resposta_correta: "B" },
      "bg.png",
      "q.mp3",
      "a.mp3",
      10,
      "font.ttf",
      "q.txt",
      { A: "a.txt", B: "b.txt" },
      false, false, false, "", "", "", ""
    );

    // For answer A (incorrect)
    expect(result.filterComplex).toContain("textfile='a.txt':fontfile='font.ttf':fontcolor=white");
    // For answer B (correct) - reveals normal then highlighted
    expect(result.filterComplex).toContain("textfile='b.txt':fontfile='font.ttf':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=1120:bordercolor=black:borderw=3:enable='lt(t,15)'");
    expect(result.filterComplex).toContain("textfile='b.txt':fontfile='font.ttf':fontcolor=green:fontsize=48:x=(w-text_w)/2:y=1120:bordercolor=black:borderw=3:box=1:boxcolor=yellow@0.8:boxborderw=10:enable='gte(t,15)'");
  });
});
