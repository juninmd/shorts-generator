import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import type { ComicBook } from "../comic/comic-types.js";
import { ffmpegBin } from "../ffmpeg-bin.js";
import { buildFontEnv } from "../ffmpeg-env.js";
import { resolveQuizFont } from "../quiz/quiz-fonts.js";
import { wrapText } from "../quiz/quiz-assets.service.js";
import type { BibleAct, BibleScript } from "./bible-script.js";

const execFileAsync = promisify(execFile);

/** Fundo por ato: cálido no gancho, escuro no contexto, dourado na virada (cor segue a emoção da cena). */
export const ACT_BACKGROUND: Record<BibleAct, string> = {
  gancho: "0x2b1b17",
  contexto: "0x1a1a2e",
  acontecimento: "0x16213e",
  virada: "0x3a2a10",
  aplicacao: "0x1d2b22",
};

const escape = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");

/**
 * Tipografia dentro da área segura 9:16: texto entre y=420 e ~1000, acima da faixa das
 * legendas (≈ 32% de baixo) e longe das bandas de UI. Uma linha por arquivo, centralizada.
 */
export function buildVerseFilters(lines: string[], linePaths: string[], refPath: string, font: string): string {
  const fontFile = escape(font);
  const size = lines.length > 5 ? 64 : 76;
  const step = Math.round(size * 1.35);
  const verse = linePaths.map((file, i) =>
    `drawtext=fontfile='${fontFile}':textfile='${escape(file)}':fontsize=${size}:fontcolor=white:borderw=3:bordercolor=black@0.6:x=(w-text_w)/2:y=${440 + i * step}`);
  const ref = `drawtext=fontfile='${fontFile}':textfile='${escape(refPath)}':fontsize=44:fontcolor=0xFFE45E:x=(w-text_w)/2:y=330`;
  return ["vignette=PI/5", ref, ...verse].join(",");
}

/** Um card PNG por cena: referência + versículo em tela; as legendas karaokê narram por cima. */
export async function buildVerseCardBook(script: BibleScript, workDir: string): Promise<ComicBook> {
  fs.mkdirSync(workDir, { recursive: true });
  const font = resolveQuizFont();
  const id = `bible-${nanoid(6)}`;
  const chapters = [];
  for (const [index, scene] of script.scenes.entries()) {
    const sceneId = `scene${index + 1}`;
    const lines = wrapText(`“${scene.verse}”`, 22).split("\n");
    const linePaths = lines.map((line, i) => {
      const file = path.join(workDir, `${sceneId}_l${i}.txt`);
      fs.writeFileSync(file, line);
      return file;
    });
    const refPath = path.join(workDir, `${sceneId}_ref.txt`);
    fs.writeFileSync(refPath, script.reference);
    const imagePath = path.join(workDir, `${sceneId}.png`);
    await execFileAsync(ffmpegBin(), [
      "-y", "-f", "lavfi", "-i", `color=c=${ACT_BACKGROUND[scene.act]}:s=1080x1920`,
      "-vf", buildVerseFilters(lines, linePaths, refPath, font),
      "-frames:v", "1", imagePath,
    ], { maxBuffer: 8 * 1024 * 1024, env: buildFontEnv() });
    chapters.push({ id: sceneId, title: scene.act, narrationText: scene.narration, imagePath });
  }
  return { id, title: script.title, chapters };
}
