import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Quiz } from "./quiz.domain.js";

export const wrapText = (text: string, maxLen: number): string => {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if ((currentLine + word).length > maxLen) {
      lines.push(currentLine.trim());
      currentLine = word + " ";
    } else {
      currentLine += word + " ";
    }
  }
  /* v8 ignore next */ if (currentLine) { lines.push(currentLine.trim()); }
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
        console.warn(`⚠️ Falha ao copiar a fonte de ${src}:`, e);
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
      console.warn("⚠️ Não foi possível copiar automaticamente a fonte Arial.");
    }
  }
  return fontFile;
};

export const prepareBackground = (tempDir: string): string => {
  let bgVideo = path.resolve("assets/backgrounds/neon.png");

  if (!fs.existsSync(bgVideo)) {
    bgVideo = path.join(tempDir, "bg_default.jpg");
    if (!fs.existsSync(bgVideo)) {
      spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=darkblue:s=1080x1920:d=1", "-frames:v", "1", normalizePath(bgVideo)]);
    }
  }
  return bgVideo;
};

export const prepareTextFiles = (quiz: Quiz, tempDir: string): { qTxtPath: string, optTxtPaths: Record<string, string> } => {
  const qTxtPath = path.join(tempDir, "q.txt");
  fs.writeFileSync(qTxtPath, wrapText(quiz.pergunta, 30));

  const optTxtPaths: Record<string, string> = {};
  for (const opt of ["A", "B", "C", "D"]) {
    const p = path.join(tempDir, `opt${opt}.txt`);
    fs.writeFileSync(p, wrapText(`${opt}) ${quiz.opcoes[opt as keyof typeof quiz.opcoes]}`, 40));
    optTxtPaths[opt] = p;
  }
  return { qTxtPath, optTxtPaths };
};
