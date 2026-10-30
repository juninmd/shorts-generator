import { describe, it, expect } from "vitest";
import { generateFilters, type QuizFilterAssets } from "../../../src/core/quiz/quiz-filters.service.js";
import { buildTimeline, TIMER_SECONDS, type Quiz } from "../../../src/core/quiz/quiz.domain.js";

const quiz: Quiz = {
  tema: "futebol",
  titulo_youtube: "Só 1% acerta a 3ª de futebol",
  hook: "SÓ 1% ACERTA A 3ª",
  perguntas: [
    { pergunta: "P1?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "B" },
    { pergunta: "P2?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "A" },
    { pergunta: "P3?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "C" },
  ],
  fato_curioso: "Fato.",
  tags: ["futebol"],
};

const baseAssets: QuizFilterAssets = {
  bgVideo: "bg.mp4",
  questionAudioPaths: ["q0.mp3", "q1.mp3", "q2.mp3"],
  answerAudioPaths: ["a0.mp3", "a1.mp3", "a2.mp3"],
  outroAudioPath: "outro.mp3",
  fontFile: "font.ttf",
  textFiles: quiz.perguntas.map((_, i) => ({
    qTxtPath: `q${i}.txt`,
    qLinePaths: [`q${i}_l0.txt`],
    optTxtPaths: { A: `q${i}optA.txt`, B: `q${i}optB.txt`, C: `q${i}optC.txt`, D: `q${i}optD.txt` },
  })),
  outroTxtPath: "outro.txt",
  outroLinePaths: ["outro_l0.txt"],
  hookTxtPath: "hook.txt",
  hasMusic: true,
  hasBeep: true,
  hasLogo: false,
  musicPath: "music.mp3",
  beepPath: "beep.mp3",
  logoPath: "",
  watermarkText: "@akitemquiz",
};

const timeline = buildTimeline([3, 3, 3], [2, 2, 2], 5);

describe("quiz-filters.service", () => {
  it("registers one input per narration plus bg/beep/music", () => {
    const { ffmpegInputs } = generateFilters(quiz, timeline, baseAssets);
    const inputCount = ffmpegInputs.filter((arg) => arg === "-i").length;
    // bg + 3 questions + 3 answers + outro + beep + music = 10
    expect(inputCount).toBe(10);
    expect(ffmpegInputs.join(" ")).toContain("-stream_loop -1");
  });

  it("draws hook, progress, question, options and countdown with enable windows", () => {
    const { filterComplex } = generateFilters(quiz, timeline, baseAssets);
    expect(filterComplex).toContain("textfile='hook.txt'");
    expect(filterComplex).toContain("expansion=none");
    expect(filterComplex).toContain("PERGUNTA 1/3");
    expect(filterComplex).toContain("PERGUNTA 3/3");
    // one countdown digit drawtext per timer second per question
    const digits = filterComplex.match(/drawtext=text='\d'/g) ?? [];
    expect(digits).toHaveLength(TIMER_SECONDS * quiz.perguntas.length);
    // the correct option is revealed on a green chip
    expect(filterComplex).toContain("boxcolor=0x2e7d32@0.95");
    // every glyph has a shadow and the text sits on a dark panel
    expect(filterComplex).toContain("shadowcolor=black@0.7");
    expect(filterComplex).toContain("drawbox=x=36:y=360:w=1008:h=1200:color=black@0.34");
  });

  it("shrinks the question type as the wrapped text grows", () => {
    const longQuiz = {
      ...quiz,
      perguntas: quiz.perguntas.map((question) => ({
        ...question,
        pergunta: "Uma pergunta bastante longa que quebra em varias linhas no painel de texto?",
      })),
    };
    const { filterComplex } = generateFilters(longQuiz, timeline, baseAssets);
    expect(filterComplex).toContain("fontsize=42");
  });

  it("concatenates narrations with one silent gap per question", () => {
    const { filterComplex } = generateFilters(quiz, timeline, baseAssets);
    expect(filterComplex).toContain(`concat=n=10:v=0:a=1[voice]`);
    const gaps = filterComplex.match(/aevalsrc=0:d=3/g) ?? [];
    expect(gaps).toHaveLength(3);
  });

  it("schedules one beep per countdown second at the timer offsets", () => {
    const { filterComplex } = generateFilters(quiz, timeline, baseAssets);
    expect(filterComplex).toContain(`asplit=${TIMER_SECONDS * 3}`);
    const firstBeepDelay = Math.round(timeline.questions[0]!.timerStart * 1000);
    expect(filterComplex).toContain(`adelay=${firstBeepDelay}|${firstBeepDelay}`);
  });

  it("omits beep/music branches when assets are missing", () => {
    const { filterComplex, ffmpegInputs } = generateFilters(quiz, timeline, {
      ...baseAssets,
      hasMusic: false,
      hasBeep: false,
    });
    expect(ffmpegInputs.filter((arg) => arg === "-i")).toHaveLength(8);
    expect(filterComplex).not.toContain("asplit");
    expect(filterComplex).not.toContain("aloop");
    expect(filterComplex).toContain("alimiter=limit=0.95:level=false[aout]");
  });

  it("keeps the beep under the narration and limits the summed audio", () => {
    const { filterComplex } = generateFilters(quiz, timeline, baseAssets);
    expect(filterComplex).toContain("[8:a]volume=0.35,asplit=9");
    expect(filterComplex).toContain("volume=0.1[bgm]");
    expect(filterComplex).toContain("normalize=0,alimiter=limit=0.95:level=false[aout]");
  });

  it("handles image background and draws logo when provided", () => {
    const assetsWithLogo: QuizFilterAssets = {
      ...baseAssets,
      bgVideo: "bg.jpg",
      hasLogo: true,
      logoPath: "logo.png"
    };

    const { filterComplex, ffmpegInputs } = generateFilters(quiz, timeline, assetsWithLogo);

    expect(ffmpegInputs.join(" ")).toContain("-loop 1 -framerate 30 -i");
    expect(filterComplex).toContain("overlay=40:150[vlogo]");
    expect(filterComplex).toContain("x=180:y=176"); // Watermark shifted for logo
  });

  it("handles missing option text files gracefully", () => {
    const quizMissingOpt: QuizFilterAssets = {
      ...baseAssets,
      textFiles: [
        {
          qTxtPath: "q0.txt",
          qLinePaths: ["q0_l0.txt"],
          optTxtPaths: { A: "optA.txt", B: "optB.txt", C: "", D: "optD.txt" } // C missing
        },
        ...baseAssets.textFiles.slice(1)
      ]
    };
    const { filterComplex } = generateFilters(quiz, timeline, quizMissingOpt);
    expect(filterComplex).toContain("optA.txt");
    expect(filterComplex).toContain("optB.txt");
    expect(filterComplex).toContain("optD.txt");
    // Should process smoothly without throwing
  });
});
