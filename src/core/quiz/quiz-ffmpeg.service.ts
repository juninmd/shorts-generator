import { spawn } from "node:child_process";
import { normalizePath } from "./quiz-assets.service.js";
import { logger } from "../logger.js";

const hmsToSeconds = (hms: string): number => {
  const parts = hms.split(":").reverse();
  const s = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const h = Number(parts[2]) || 0;
  return h * 3600 + m * 60 + s;
};

export const runFFmpeg = async (
  ffmpegInputs: string[],
  filterComplex: string,
  outputPath: string,
  totalSeconds: number
): Promise<void> => {
  const args = ["-y", "-hide_banner", ...ffmpegInputs];
  args.push("-filter_complex", filterComplex, "-map", "[vout]", "-map", "[aout]");
  args.push(
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-tune", "fastdecode,zerolatency",
    "-filter_threads", "2",
    "-r", "30",
    "-crf", "28",
    "-threads", "0",
    "-c:a", "aac",
    "-pix_fmt", "yuv420p",
    "-t", totalSeconds.toString(),
    normalizePath(outputPath)
  );

  logger.info({ outputPath }, "🎥 Processando FFmpeg...");

  await new Promise<void>((resolve, reject) => {
    const ff = spawn("ffmpeg", args);
    let lastPct = -1;

    const keepAlive = setInterval(() => {
      logger.info("⏳ ffmpeg still running...");
    }, 5 * 60 * 1000);

    ff.stderr.on("data", (chunk: Buffer | string) => {
      const str = chunk.toString();

      for (const rawLine of str.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) { continue; }

        if (/^(Input #|Duration:|Stream #|Metadata:)/.test(line)) {
          logger.debug(line);
        }

        const m = line.match(/time=(\d+:\d+:\d+\.\d+)/);
        if (m && m[1]) {
          const secs = hmsToSeconds(m[1]);
          const pct = Math.min(100, Math.round((secs / totalSeconds) * 100));
          if (pct !== lastPct) {
            logger.info(`⏳ Progresso FFmpeg: ${pct}%`);
            lastPct = pct;
          }
        }
      }
    });

    ff.on("close", (code: number | null) => {
      clearInterval(keepAlive);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });

  logger.info(`✅ Vídeo gerado com sucesso: ${outputPath}`);
};
