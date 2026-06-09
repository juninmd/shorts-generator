import { describe, it, expect } from "vitest";
import { generateFilters } from "../../../src/core/quiz/quiz-filters.service";
import { normalizePath } from "../../../src/core/quiz/quiz-assets.service";
import type { Quiz } from "../../../src/core/quiz/quiz.domain";

describe("Quiz Filters Service", () => {
  const defaultQuiz: Quiz = {
    tema: "test",
    pergunta: "Question",
    opcoes: { A: "1", B: "2", C: "3", D: "4" },
    resposta_correta: "A",
    fato_curioso: "Fact"
  };

  it("should generate filters for image background with music, beep, and logo", () => {
    const res = generateFilters(
      defaultQuiz,
      "bg.jpg",
      "q.mp3",
      "a.mp3",
      10,
      "font.ttf",
      "q.txt",
      { A: "optA.txt", B: "optB.txt", C: "optC.txt", D: "optD.txt" },
      true, // hasMusic
      true, // hasBeep
      true, // hasLogo
      "music.mp3",
      "beep.mp3",
      "logo.png"
    );

    // image background uses loop and framerate
    expect(res.ffmpegInputs).toContain("-loop");
    expect(res.ffmpegInputs).toContain("-framerate");
    expect(res.ffmpegInputs).toContain("-i");
    expect(res.ffmpegInputs).toContain(normalizePath("bg.jpg"));

    // logo input
    expect(res.ffmpegInputs).toContain(normalizePath("logo.png"));

    expect(res.filterComplex).toContain("overlay=40:40"); // logo overlay
    expect(res.filterComplex).toContain("vlogo");
    expect(res.filterComplex).toContain("text='@akitemquiz'");

    // beep mix
    expect(res.filterComplex).toContain("amix=inputs=2:dropout_transition=0:normalize=0");
    // bgm mix
    expect(res.filterComplex).toContain("aloop=loop=-1");
    expect(res.filterComplex).toContain("amix=inputs=2:duration=shortest");
  });

  it("should generate filters for video background without music, beep, and logo", () => {
    const res = generateFilters(
      defaultQuiz,
      "bg.mp4",
      "q.mp3",
      "a.mp3",
      10,
      "font.ttf",
      "q.txt",
      { A: "optA.txt" }, // Missing B, C, D (testing partial options logic)
      false, // hasMusic
      false, // hasBeep
      false, // hasLogo
      "music.mp3", // path provided but flag false
      "beep.mp3",
      "logo.png",
      "customWatermark"
    );

    // video background uses stream_loop
    expect(res.ffmpegInputs).toContain("-stream_loop");
    expect(res.ffmpegInputs).toContain("-1");
    expect(res.ffmpegInputs).not.toContain("-loop");

    // No logo logic
    expect(res.ffmpegInputs).not.toContain("logo.png");
    expect(res.filterComplex).not.toContain("overlay=40:40");
    expect(res.filterComplex).toContain("text='customWatermark':fontfile='font.ttf':fontcolor=white:fontsize=35:x=40:y=40"); // Default position for no logo

    // Options mapping check (B, C, D missing)
    expect(res.filterComplex).toContain("optA.txt");
    expect(res.filterComplex).not.toContain("optB.txt");

    // No music/beep checks
    expect(res.filterComplex).not.toContain("aloop");
    expect(res.filterComplex).toContain("[base]volume=1.0[aout]");
  });

  it("should handle missing correct option safely (fallback branch paths)", () => {
    const quizB: Quiz = {
      ...defaultQuiz,
      resposta_correta: "B" // Making correct option B
    };

    const res = generateFilters(
      quizB,
      "bg.mp4",
      "q.mp3",
      "a.mp3",
      10,
      "font.ttf",
      "q.txt",
      { A: "optA.txt", B: "optB.txt" },
      false, false, false, "", "", ""
    );

    // Box highlight on correct option (B)
    expect(res.filterComplex).toContain("box=1:boxcolor=yellow");
  });
});
