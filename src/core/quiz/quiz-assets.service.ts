import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Quiz } from "./quiz.domain.js";
import { logger } from "../logger.js";
import { ffmpegBin } from "../ffmpeg-bin.js";

export const wrapText = (text: string, maxLen: number): string => {
  if (!text) return "";
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if (currentLine === "") {
        currentLine = word;
    } else if ((currentLine + " " + word).length > maxLen) {

      lines.push(currentLine);

      currentLine = word;
    } else {
      currentLine += " " + word;
    }
  }
  if (currentLine.length > 0) { lines.push(currentLine); }
  return lines.join("\n");
};

export const normalizePath = (p: string) => path.resolve(p).replace(/\\/g, "/");
export const rel = (p: string) => path.relative(process.cwd(), p).replace(/\\/g, "/");
export const esc = (p: string) => rel(p).replace(/([:])/g, "\\$1");

export { ensureFont, resolveQuizFont, BUNDLED_FONT } from "./quiz-fonts.js";

// Distinct color pairs so every video gets its own look — identical backgrounds
// across uploads feed YouTube's templated/mass-produced content detection.
const GRADIENT_PALETTES: Array<[string, string]> = [
  ["0x1a2a6c", "0xb21f1f"], ["0x0f2027", "0x2c5364"], ["0x42275a", "0x734b6d"],
  ["0x141e30", "0x243b55"], ["0x232526", "0x414345"], ["0x1d4350", "0xa43931"],
  ["0x11998e", "0x0b3866"], ["0x2c3e50", "0x4ca1af"],
];

/**
 * Animated gradient background. Rendered larger than the frame and slowly cropped
 * with a sine drift, so the motion is continuous (no loop seam) and the vignette
 * keeps the eye on the text panel.
 */
export const prepareBackground = (tempDir: string, durationSec = 60): string => {
  const [c0, c1] = GRADIENT_PALETTES[Math.floor(Math.random() * GRADIENT_PALETTES.length)]!;
  const bgVideo = path.join(tempDir, "bg_gradient.mp4");
  const drift = "crop=1080:1920:'(in_w-1080)/2+36*sin(t/7)':'(in_h-1920)/2+42*cos(t/9)'";
  const render = spawnSync(ffmpegBin(), [
    "-y", "-hide_banner", "-nostdin", "-f", "lavfi",
    "-i", `gradients=s=1188x2112:c0=${c0}:c1=${c1}:speed=0.02:r=30`,
    "-t", String(Math.ceil(durationSec) + 1),
    "-vf", `${drift},noise=alls=3:allf=t,vignette=PI/5`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-g", "60",
    normalizePath(bgVideo),
  ]);
  if (render.status === 0 && fs.existsSync(bgVideo)) {
    return bgVideo;
  }
  logger.warn({ stderr: render.stderr?.toString().slice(-400) }, "Fundo animado falhou — usando fallback estático");
  let fallback = path.resolve("assets/backgrounds/neon.png");
  if (!fs.existsSync(fallback)) {
    fallback = path.join(tempDir, "bg_default.jpg");
    if (!fs.existsSync(fallback)) {
      spawnSync(ffmpegBin(), ["-y", "-f", "lavfi", "-i", "color=c=darkblue:s=1080x1920:d=1", "-frames:v", "1", normalizePath(fallback)]);
    }
  }
  return fallback;
};

export interface QuestionTextFiles {
  qTxtPath: string;
  /** One file per wrapped line: drawtext can only centre a line, not a block. */
  qLinePaths: string[];
  optTxtPaths: Record<string, string>;
}

export interface QuizTextFiles {
  questions: QuestionTextFiles[];
  outroTxtPath: string;
  outroLinePaths: string[];
  hookTxtPath: string;
}

export const prepareTextFiles = (quiz: Quiz, tempDir: string): QuizTextFiles => {
  const questions = quiz.perguntas.map((question, i) => {
    const qTxtPath = path.join(tempDir, `q${i}.txt`);
    // 24 chars keeps a long question inside the text panel at the smallest font size.
    const lines = wrapText(question.pergunta, 24).split("\n");
    fs.writeFileSync(qTxtPath, lines.join("\n"));
    const qLinePaths = lines.map((line, j) => {
      const p = path.join(tempDir, `q${i}_l${j}.txt`);
      fs.writeFileSync(p, line);
      return p;
    });

    const optTxtPaths: Record<string, string> = {};
    for (const opt of ["A", "B", "C", "D"]) {
      const p = path.join(tempDir, `q${i}opt${opt}.txt`);
      fs.writeFileSync(p, wrapText(`${opt}) ${question.opcoes[opt as keyof typeof question.opcoes]}`, 34));
      optTxtPaths[opt] = p;
    }
    return { qTxtPath, qLinePaths, optTxtPaths };
  });

  const outroTxtPath = path.join(tempDir, "outro.txt");
  const outroLines = wrapText(quiz.fato_curioso, 30).split("\n");
  fs.writeFileSync(outroTxtPath, outroLines.join("\n"));
  const outroLinePaths = outroLines.map((line, j) => {
    const p = path.join(tempDir, `outro_l${j}.txt`);
    fs.writeFileSync(p, line);
    return p;
  });
  // Hook goes through a textfile: inline drawtext text= chokes on "%" (drawtext
  // expansion) and quoting edge cases the LLM can produce.
  const hookTxtPath = path.join(tempDir, "hook.txt");
  fs.writeFileSync(hookTxtPath, wrapText(quiz.hook.toUpperCase(), 24));
  return { questions, outroTxtPath, outroLinePaths, hookTxtPath };
};
