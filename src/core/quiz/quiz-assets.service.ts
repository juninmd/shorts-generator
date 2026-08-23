import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Quiz } from "./quiz.domain.js";
import { logger } from "../logger.js";

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

export const ensureFont = (): string => {
  const fontFile = "assets/fonts/arialbd.ttf";
  if (!fs.existsSync(fontFile)) {
    fs.mkdirSync("assets/fonts", { recursive: true });
    const tryCopy = (src: string) => {
      try {
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, fontFile);
          return true;
        }
      } catch (e) {
        logger.warn({ err: e, src }, "Falha ao copiar a fonte");
      }
      return false;
    };

    let copied = false;
    if (process.platform === "win32") {
      copied = tryCopy("C:/Windows/Fonts/arialbd.ttf");
    } else {
      copied = tryCopy("/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf");
      if (!copied) {
        const candidates = [
          "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
          "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
        ];
        for (const c of candidates) {
          if (tryCopy(c)) {
            copied = true;
            break;
          }
        }
      }
    }
    if (!copied) {
      logger.warn("Não foi possível copiar automaticamente a fonte Arial.");
    }
  }
  return fontFile;
};

// Distinct color pairs so every video gets its own look — identical backgrounds
// across uploads feed YouTube's templated/mass-produced content detection.
const GRADIENT_PALETTES: Array<[string, string]> = [
  ["0x1a2a6c", "0xb21f1f"], ["0x0f2027", "0x2c5364"], ["0x42275a", "0x734b6d"],
  ["0x141e30", "0x243b55"], ["0x232526", "0x414345"], ["0x1d4350", "0xa43931"],
  ["0x11998e", "0x0b3866"], ["0x2c3e50", "0x4ca1af"],
];

export const prepareBackground = (tempDir: string, durationSec = 60): string => {
  const [c0, c1] = GRADIENT_PALETTES[Math.floor(Math.random() * GRADIENT_PALETTES.length)]!;
  const bgVideo = path.join(tempDir, "bg_gradient.mp4");
  const render = spawnSync("ffmpeg", [
    "-y", "-f", "lavfi",
    "-i", `gradients=s=1080x1920:c0=${c0}:c1=${c1}:speed=0.03:r=30`,
    "-t", String(Math.ceil(durationSec)),
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
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
      spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=darkblue:s=1080x1920:d=1", "-frames:v", "1", normalizePath(fallback)]);
    }
  }
  return fallback;
};

export interface QuestionTextFiles {
  qTxtPath: string;
  optTxtPaths: Record<string, string>;
}

export const prepareTextFiles = (quiz: Quiz, tempDir: string): { questions: QuestionTextFiles[]; outroTxtPath: string; hookTxtPath: string } => {
  const questions = quiz.perguntas.map((question, i) => {
    const qTxtPath = path.join(tempDir, `q${i}.txt`);
    fs.writeFileSync(qTxtPath, wrapText(question.pergunta, 30));

    const optTxtPaths: Record<string, string> = {};
    for (const opt of ["A", "B", "C", "D"]) {
      const p = path.join(tempDir, `q${i}opt${opt}.txt`);
      fs.writeFileSync(p, wrapText(`${opt}) ${question.opcoes[opt as keyof typeof question.opcoes]}`, 40));
      optTxtPaths[opt] = p;
    }
    return { qTxtPath, optTxtPaths };
  });

  const outroTxtPath = path.join(tempDir, "outro.txt");
  fs.writeFileSync(outroTxtPath, wrapText(quiz.fato_curioso, 30));
  // Hook goes through a textfile: inline drawtext text= chokes on "%" (drawtext
  // expansion) and quoting edge cases the LLM can produce.
  const hookTxtPath = path.join(tempDir, "hook.txt");
  fs.writeFileSync(hookTxtPath, wrapText(quiz.hook.toUpperCase(), 24));
  return { questions, outroTxtPath, hookTxtPath };
};
