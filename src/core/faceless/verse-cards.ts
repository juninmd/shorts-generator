import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import type { ComicBook, ComicChapter } from "../comic/comic-types.js";
import { ffmpegBin } from "../ffmpeg-bin.js";
import { buildFontEnv } from "../ffmpeg-env.js";
import { resolveQuizFont } from "../quiz/quiz-fonts.js";
import { wrapText } from "../quiz/quiz-assets.service.js";
import type { BibleAct, BibleScript } from "./bible-script.js";
import { fetchSceneFootage } from "./stock-footage.js";

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
const lineStep = (lines: number) => Math.round((lines > 5 ? 64 : 76) * 1.35);

/**
 * Tipografia dentro da área segura 9:16: texto entre y=330 e ~1000, acima da faixa das
 * legendas (≈ 32% de baixo) e longe das bandas de UI. Uma linha por arquivo, centralizada.
 */
export function buildVerseFilters(lines: string[], linePaths: string[], refPath: string, font: string): string[] {
  const fontFile = escape(font);
  const size = lines.length > 5 ? 64 : 76;
  const verse = linePaths.map((file, i) =>
    `drawtext=fontfile='${fontFile}':textfile='${escape(file)}':fontsize=${size}:fontcolor=white:borderw=3:bordercolor=black@0.6:x=(w-text_w)/2:y=${440 + i * lineStep(lines.length)}`);
  const ref = `drawtext=fontfile='${fontFile}':textfile='${escape(refPath)}':fontsize=44:fontcolor=0xFFE45E:x=(w-text_w)/2:y=330`;
  return [ref, ...verse];
}

/** Faixa escura translúcida atrás do texto para ele ler sobre qualquer vídeo de acervo. */
export const scrimFilter = (lines: number): string =>
  `drawbox=x=0:y=290:w=iw:h=${190 + lines * lineStep(lines)}:color=black@0.5:t=fill:replace=1`;

async function ffmpeg(args: string[]): Promise<void> {
  await execFileAsync(ffmpegBin(), args, { maxBuffer: 8 * 1024 * 1024, env: buildFontEnv() });
}

/**
 * Um capítulo por cena: vídeo de acervo (Pexels) com o versículo em overlay quando há
 * footage; sem chave/match, card sólido com vinheta. As legendas karaokê narram por cima.
 */
export async function buildVerseCardBook(script: BibleScript, workDir: string, pexelsApiKey?: string): Promise<ComicBook> {
  fs.mkdirSync(workDir, { recursive: true });
  const font = resolveQuizFont();
  const used = new Set<number>();
  const chapters: ComicChapter[] = [];
  for (const [index, scene] of script.scenes.entries()) {
    const id = `scene${index + 1}`;
    const lines = wrapText(`“${scene.verse}”`, 22).split("\n");
    const linePaths = lines.map((line, i) => {
      const file = path.join(workDir, `${id}_l${i}.txt`);
      fs.writeFileSync(file, line);
      return file;
    });
    const refPath = path.join(workDir, `${id}_ref.txt`);
    fs.writeFileSync(refPath, script.reference);
    const text = buildVerseFilters(lines, linePaths, refPath, font);
    const imagePath = path.join(workDir, `${id}.png`);
    const videoPath = await fetchSceneFootage(scene.keywords, path.join(workDir, `${id}.mp4`), pexelsApiKey, used);
    await ffmpeg([
      "-y", "-f", "lavfi", "-i", `color=c=${ACT_BACKGROUND[scene.act]}:s=1080x1920`,
      "-vf", ["vignette=PI/5", ...text].join(","), "-frames:v", "1", imagePath,
    ]);
    const chapter: ComicChapter = { id, title: scene.act, narrationText: scene.narration, imagePath };
    if (videoPath) {
      const overlayPath = path.join(workDir, `${id}_overlay.png`);
      await ffmpeg([
        "-y", "-f", "lavfi", "-i", "color=c=black@0:s=1080x1920,format=rgba",
        "-vf", [scrimFilter(lines.length), ...text].join(","), "-frames:v", "1", overlayPath,
      ]);
      Object.assign(chapter, { videoPath, overlayPath });
    }
    chapters.push(chapter);
  }
  return { id: `bible-${nanoid(6)}`, title: script.title, chapters };
}
