import fs from "node:fs";
import path from "node:path";
import { pickBackgroundMusic } from "../audio-ducking.js";

const MUSIC_DIR = "assets/music/bible";

/** BGM_FILE/BGM_DIR quando configurados; senão sorteia uma das trilhas de `assets/music/bible` (Kevin MacLeod, CC BY 4.0). */
export function pickBibleMusic(dir = MUSIC_DIR): string | undefined {
  const configured = pickBackgroundMusic();
  if (configured) return configured;
  if (!fs.existsSync(dir)) return undefined;
  const tracks = fs.readdirSync(dir).filter((name) => /\.mp3$/i.test(name));
  if (tracks.length === 0) return undefined;
  return path.join(dir, tracks[Math.floor(Math.random() * tracks.length)]!);
}

/** Crédito CC BY 4.0 da trilha escolhida (exigido na descrição); undefined para trilhas fora de `credits.json`. */
export function bibleMusicCredit(musicPath: string | undefined): string | undefined {
  if (!musicPath) return undefined;
  const creditsFile = path.join(path.dirname(musicPath), "credits.json");
  if (!fs.existsSync(creditsFile)) return undefined;
  const credits = JSON.parse(fs.readFileSync(creditsFile, "utf8")) as Record<string, string>;
  const title = credits[path.basename(musicPath)];
  if (!title) return undefined;
  return `🎵 Música: "${title}" — Kevin MacLeod (incompetech.com)\nLicença Creative Commons Atribuição 4.0: http://creativecommons.org/licenses/by/4.0/`;
}
