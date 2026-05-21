import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";

export interface WordTimestamp {
  start: number;
  end: number;
  word: string;
}

export interface NarrationResult {
  audioPath: string;
  wordTimestamps: WordTimestamp[];
}

const vttTimeToSeconds = (vttTime: string): number => {
  const [h, m, s] = vttTime.split(":");
  if (h === undefined || m === undefined || s === undefined) { return 0; }
  return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s.replace(",", "."));
};

export const generateNarration = async (
  text: string,
  fileName: string,
  outputDir: string = "temp_assets"
): Promise<NarrationResult> => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const audioPath = path.join(outputDir, `${fileName}.mp3`);
  const vttPath = path.join(outputDir, `${fileName}.vtt`);
  const voice = "pt-BR-ThalitaMultilingualNeural";

  logger.info({ fileName }, `🗣️ Invocando edge-tts (Python) para: ${fileName}...`);

  try {
    const args = [
      "-m", "edge_tts",
      "--voice", voice,
      "--text", text,
      "--write-media", audioPath,
      "--write-subtitles", vttPath
    ];

    const result = spawnSync("python", args, { encoding: "utf-8" });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`Command failed with exit code ${result.status}: ${result.stderr}`);
    }

    const vttContent = fs.readFileSync(vttPath, "utf8");
    const wordTimestamps: WordTimestamp[] = [];

    const lines = vttContent.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.includes("-->")) {
        const parts = line.split(" --> ");
        if (parts.length < 2) { continue; }
        const [startStr, endStr] = parts;
        const nextLine = lines[i + 1];
        const word = nextLine ? nextLine.trim() : undefined;
        if (word && startStr && endStr) {
          wordTimestamps.push({
            start: vttTimeToSeconds(startStr),
            end: vttTimeToSeconds(endStr),
            word: word
          });
        }
      }
    }

    return { audioPath, wordTimestamps };
  } catch (error: any) {
    logger.error({ error: error.message }, "❌ Erro ao invocar edge-tts (Python)");
    throw new Error(`Falha na narração via edge-tts: ${error.message}`);
  }
};
