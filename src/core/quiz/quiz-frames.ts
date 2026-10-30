import { esc, wrapText, type QuestionTextFiles } from "./quiz-assets.service.js";
import { TIMER_SECONDS, type Quiz, type QuizTimeline } from "./quiz.domain.js";

/**
 * Video layer of the quiz: one legible, safe-area aware frame with a dark panel
 * behind the text, a shadow on every glyph, and a countdown chip that never
 * collides with a long question. Kept apart from the audio/input assembly in
 * `quiz-filters.service.ts`.
 */

export interface FrameAssets {
  fontFile: string;
  textFiles: QuestionTextFiles[];
  outroTxtPath: string;
  outroLinePaths: string[];
  hookTxtPath: string;
  hasLogo: boolean;
  /** Input index of the logo, -1 when absent. */
  logoIdx: number;
  watermarkText: string;
}

const LETTERS = ["A", "B", "C", "D"] as const;
const OPTION_Y: Record<(typeof LETTERS)[number], number> = { A: 820, B: 1040, C: 1260, D: 1480 };
/** Text panel: keeps captions readable over any gradient. */
const PANEL = "drawbox=x=36:y=360:w=1008:h=1200:color=black@0.34:t=fill";
const SHADOW = "shadowcolor=black@0.7:shadowx=3:shadowy=3";

/** Smaller type for a question that wraps to more lines, so it never reaches the options. */
export function questionFontSize(question: string): number {
  const lines = wrapText(question, 24).split("\n").length;
  if (lines <= 2) return 56;
  if (lines === 3) return 48;
  return 42;
}

/** The whole picture chain, from the background input to `[vout]`. */
export function buildFrameFilters(quiz: Quiz, timeline: QuizTimeline, a: FrameAssets): string[] {
  const filters: string[] = [
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
      + "eq=contrast=1.05:saturation=1.06[vbg]",
    `[vbg]${PANEL}[vpanel]`,
  ];
  let vC = "vpanel";
  let vI = 0;
  const draw = (spec: string) => {
    filters.push(`[${vC}]${spec}[v${vI}]`);
    vC = `v${vI++}`;
  };
  const t = (s: number) => s.toFixed(2);
  const dt = (source: string, color: string, size: number, x: string, y: number, extra = "") =>
    `drawtext=${source}:fontfile='${a.fontFile}':fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`
    + `:bordercolor=black:borderw=3:${SHADOW}${extra}`;

  if (a.hasLogo && a.logoIdx !== -1) {
    filters.push(`[${a.logoIdx}:v]scale=120:-1[logo_scaled]`);
    filters.push(`[${vC}][logo_scaled]overlay=40:150[vlogo]`);
    vC = "vlogo";
    draw(dt(`text='${a.watermarkText}'`, "white", 32, "180", 176, ":borderw=2"));
  } else {
    draw(dt(`text='${a.watermarkText}'`, "white", 32, "40", 150, ":borderw=2"));
  }

  // Hook headline during the whole first question block — the swipe decision window.
  const firstReveal = timeline.questions[0]!.revealStart;
  draw(dt(`textfile='${esc(a.hookTxtPath)}'`, "yellow", 54, "(w-text_w)/2", 240,
    `:expansion=none:line_spacing=8:enable='between(t,0,${t(firstReveal)})'`));

  quiz.perguntas.forEach((question, i) => {
    const s = timeline.questions[i]!;
    const files = a.textFiles[i]!;
    const blockEnd = i + 1 < quiz.perguntas.length ? timeline.questions[i + 1]!.qStart : timeline.outroStart;
    const window = `:enable='between(t,${t(s.qStart)},${t(blockEnd)})'`;
    const correct = question.resposta_correta;
    const questionSize = questionFontSize(question.pergunta);

    draw(dt(`text='PERGUNTA ${i + 1}/${quiz.perguntas.length}'`, "yellow", 34, "(w-text_w)/2", 390, window));
    // One drawtext per wrapped line: a textfile block is left-aligned, a line is not.
    const lineHeight = Math.round(questionSize * 1.22);
    files.qLinePaths.forEach((linePath, j) => {
      draw(dt(`textfile='${esc(linePath)}'`, "white", questionSize, "(w-text_w)/2", 460 + j * lineHeight, window));
    });

    for (const opt of LETTERS) {
      const optFile = files.optTxtPaths[opt];
      if (!optFile) continue;
      if (opt === correct) {
        draw(dt(`textfile='${esc(optFile)}'`, "white", 46, "(w-text_w)/2", OPTION_Y[opt],
          `:enable='between(t,${t(s.qStart)},${t(s.revealStart)})'`));
        draw(dt(`textfile='${esc(optFile)}'`, "white", 46, "(w-text_w)/2", OPTION_Y[opt],
          `:box=1:boxcolor=0x2e7d32@0.95:boxborderw=14:enable='between(t,${t(s.revealStart)},${t(blockEnd)})'`));
      } else {
        draw(dt(`textfile='${esc(optFile)}'`, "white@0.92", 46, "(w-text_w)/2", OPTION_Y[opt], window));
      }
    }

    // Countdown on the right so a long question never runs under it.
    for (let k = 0; k < TIMER_SECONDS; k++) {
      draw(dt(`text='${TIMER_SECONDS - k}'`, "yellow", 96, "w-text_w-90", 700,
        `:box=1:boxcolor=black@0.55:boxborderw=18:enable='between(t,${t(s.timerStart + k)},${t(s.timerStart + k + 1)})'`));
    }
  });

  const o = t(timeline.outroStart);
  a.outroLinePaths.forEach((linePath, j) => {
    draw(dt(`textfile='${esc(linePath)}'`, "white", 50, "(w-text_w)/2", 520 + j * 62, `:enable='gte(t,${o})'`));
  });
  draw(dt(`text='COMENTA quantas você acertou!'`, "yellow", 50, "(w-text_w)/2", 1000, `:enable='gte(t,${o})'`));
  draw(dt(`text='E se inscreve para o próximo!'`, "white", 40, "(w-text_w)/2", 1110, `:enable='gte(t,${o})'`));

  filters.push(`[${vC}]copy[vout]`);
  return filters;
}
