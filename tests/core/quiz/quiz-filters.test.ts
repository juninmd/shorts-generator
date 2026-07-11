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
    optTxtPaths: { A: `q${i}optA.txt`, B: `q${i}optB.txt`, C: `q${i}optC.txt`, D: `q${i}optD.txt` },
  })),
  outroTxtPath: "outro.txt",
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
    // correct option gets the green reveal variant
    expect(filterComplex).toContain("fontcolor=green");
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
    expect(filterComplex).toContain("volume=1.0[aout]");
  });
});
