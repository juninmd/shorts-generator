import fs from "node:fs";
import path from "node:path";
import { pickBackgroundMusic } from "../audio-ducking.js";

const MUSIC_DIR = "assets/music/bible";

/** BGM_FILE/BGM_DIR quando configurados; senão uma trilha ambiente original de `assets/music/bible` (pads sintetizados, sem licença de terceiros). */
export function pickBibleMusic(dir = MUSIC_DIR): string | undefined {
  const configured = pickBackgroundMusic();
  if (configured) return configured;
  if (!fs.existsSync(dir)) return undefined;
  const tracks = fs.readdirSync(dir).filter((name) => /\.mp3$/i.test(name));
  if (tracks.length === 0) return undefined;
  return path.join(dir, tracks[Math.floor(Math.random() * tracks.length)]!);
}
