import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import type { ComicBook, ComicChapter } from "../comic/comic-types.js";
import { ffmpegBin } from "../ffmpeg-bin.js";
import { logger } from "../logger.js";
import { buildFontEnv } from "../ffmpeg-env.js";
import { resolveQuizFont } from "../quiz/quiz-fonts.js";
import { wrapText } from "../quiz/quiz-assets.service.js";
import type { BibleAct, BibleScript } from "./bible-script.js";
import { downloadFootage, searchFootageCandidates } from "./stock-footage.js";
import { isBlockedFootage, type FootageJudge, type FootageScene } from "./footage-judge.js";

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
/** Poppins ExtraBold ≈ 0.62 em por caractere: encolhe a fonte para a linha mais larga caber em 860px. */
export const verseFontSize = (lines: string[]): number => {
  const widest = Math.max(...lines.map((line) => line.length));
  return Math.max(48, Math.min(76, Math.floor(860 / (0.62 * widest))));
};
const lineStep = (lines: string[]) => Math.round(verseFontSize(lines) * 1.35);

/**
 * Tipografia dentro da área segura 9:16: texto entre y=330 e ~1000, acima da faixa das
 * legendas (≈ 32% de baixo) e longe das bandas de UI. Uma linha por arquivo, centralizada.
 */
export function buildVerseFilters(lines: string[], linePaths: string[], refPath: string, font: string): string[] {
  const fontFile = escape(font);
  const size = verseFontSize(lines);
  const verse = linePaths.map((file, i) =>
    `drawtext=fontfile='${fontFile}':textfile='${escape(file)}':fontsize=${size}:fontcolor=white:borderw=3:bordercolor=black@0.6:x=(w-text_w)/2:y=${440 + i * lineStep(lines)}`);
  const ref = `drawtext=fontfile='${fontFile}':textfile='${escape(refPath)}':fontsize=44:fontcolor=0xFFE45E:x=(w-text_w)/2:y=330`;
  return [ref, ...verse];
}

/** Faixa escura translúcida atrás do texto para ele ler sobre qualquer vídeo de acervo. */
export const scrimFilter = (lines: string[]): string =>
  `drawbox=x=0:y=290:w=iw:h=${190 + lines.length * lineStep(lines)}:color=black@0.5:t=fill:replace=1`;

/** Busca por ato quando as palavras do modelo não acham nada: genérico e contemplativo. */
export const ACT_FOOTAGE: Record<BibleAct, string> = {
  gancho: "sunset sky",
  contexto: "countryside landscape",
  acontecimento: "walking dirt road",
  virada: "sunlight through clouds",
  aplicacao: "praying hands",
};

/**
 * Palavras do modelo → só as duas primeiras → busca genérica do ato. Cada busca passa pelo filtro de
 * termos proibidos e pelo juiz de contexto; sem aprovação devolve null (o capítulo vira card liso).
 */
export async function findFootage(
  scene: FootageScene & { keywords: string; act: BibleAct },
  destination: string,
  apiKey: string | undefined,
  used: Set<number>,
  judge: FootageJudge | undefined,
): Promise<string | null> {
  if (!apiKey || !judge) return null;
  const queries = [scene.keywords, scene.keywords.split(/\s+/).slice(0, 2).join(" "), ACT_FOOTAGE[scene.act]];
  for (const query of new Set(queries)) {
    const candidates = (await searchFootageCandidates(query, apiKey, used)).filter((c) => !isBlockedFootage(c.description));
    const pick = candidates.length > 0 ? await judge(scene, candidates) : null;
    const chosen = candidates.find((c) => c.id === pick);
    if (!chosen) {
      logger.info({ query, act: scene.act, candidates: candidates.length }, "Bible footage: nothing in context, trying a broader query");
      continue;
    }
    try {
      const file = await downloadFootage(chosen.url, destination);
      used.add(chosen.id);
      return file;
    } catch (error) {
      logger.warn({ query, error: error instanceof Error ? error.message : String(error) }, "Bible footage download failed");
    }
  }
  return null;
}

async function ffmpeg(args: string[]): Promise<void> {
  await execFileAsync(ffmpegBin(), args, { maxBuffer: 8 * 1024 * 1024, env: buildFontEnv() });
}

/**
 * Um capítulo por cena: vídeo de acervo (Pexels) com o versículo em overlay quando há
 * footage; sem chave/match, card sólido com vinheta. As legendas karaokê narram por cima.
 */
export async function buildVerseCardBook(
  script: BibleScript,
  workDir: string,
  pexelsApiKey?: string,
  judge?: FootageJudge,
): Promise<ComicBook> {
  fs.mkdirSync(workDir, { recursive: true });
  const font = resolveQuizFont();
  const used = new Set<number>();
  const chapters: ComicChapter[] = [];
  for (const [index, scene] of script.scenes.entries()) {
    const id = `scene${index + 1}`;
    const lines = wrapText(`“${scene.verse}”`, 20).split("\n");
    const linePaths = lines.map((line, i) => {
      const file = path.join(workDir, `${id}_l${i}.txt`);
      fs.writeFileSync(file, line);
      return file;
    });
    const refPath = path.join(workDir, `${id}_ref.txt`);
    fs.writeFileSync(refPath, script.reference);
    const text = buildVerseFilters(lines, linePaths, refPath, font);
    const imagePath = path.join(workDir, `${id}.png`);
    const videoPath = await findFootage(scene, path.join(workDir, `${id}.mp4`), pexelsApiKey, used, judge);
    await ffmpeg([
      "-y", "-f", "lavfi", "-i", `color=c=${ACT_BACKGROUND[scene.act]}:s=1080x1920`,
      "-vf", ["vignette=PI/5", ...text].join(","), "-frames:v", "1", imagePath,
    ]);
    const chapter: ComicChapter = { id, title: scene.act, narrationText: scene.narration, imagePath };
    if (videoPath) {
      const overlayPath = path.join(workDir, `${id}_overlay.png`);
      await ffmpeg([
        "-y", "-f", "lavfi", "-i", "color=c=black@0:s=1080x1920,format=rgba",
        "-vf", [scrimFilter(lines), ...text].join(","), "-frames:v", "1", overlayPath,
      ]);
      Object.assign(chapter, { videoPath, overlayPath });
    }
    chapters.push(chapter);
  }
  return { id: `bible-${nanoid(6)}`, title: script.title, chapters };
}
