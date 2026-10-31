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
