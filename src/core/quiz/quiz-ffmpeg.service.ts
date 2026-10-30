import { spawn } from "node:child_process";
import { normalizePath } from "./quiz-assets.service.js";
import { logger } from "../logger.js";
import { ffmpegBin } from "../ffmpeg-bin.js";
import { ffmpegTimeoutMs } from "../ffmpeg-run.js";

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
  const args = ["-y", "-hide_banner", "-nostdin", ...ffmpegInputs];
  args.push("-filter_complex", filterComplex, "-map", "[vout]", "-map", "[aout]");
  args.push(
    "-c:v", "libx264",
    // ultrafast at CRF 28 turned the 1080x1920 question cards into blocky text; veryfast at 23
    // still encodes a mostly-static quiz frame quickly and keeps the type readable.
    "-preset", "veryfast",
    "-tune", "fastdecode,zerolatency",
    "-filter_threads", "2",
    "-r", "30",
    "-crf", "23",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-g", "60",
    "-colorspace", "bt709",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-ac", "2",
    "-movflags", "+faststart",
    "-t", totalSeconds.toString(),
    normalizePath(outputPath)
  );

  logger.info({ outputPath }, "🎥 Processando FFmpeg...");

  await new Promise<void>((resolve, reject) => {
    // ignore stdin (never prompt/block) and stdout (video goes to a file, so an
    // undrained stdout pipe could deadlock ffmpeg); keep stderr for progress.
    const ff = spawn(ffmpegBin(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let lastPct = -1;
    let timedOut = false;
    const startedAt = Date.now();
    const timeoutMs = ffmpegTimeoutMs();

    const keepAlive = setInterval(() => {
      logger.info("⏳ ffmpeg still running...");
    }, 5 * 60 * 1000);

    // A wedged encoder must not hold the worker forever: kill it and say why.
    const killer = setTimeout(() => {
      timedOut = true;
      logger.error({ outputPath, timeoutMs }, "❌ FFmpeg excedeu o timeout — encerrando");
      ff.kill("SIGKILL");
    }, timeoutMs);

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
            const elapsed = (Date.now() - startedAt) / 1000;
            const eta = pct > 0 ? Math.max(0, Math.round((elapsed * (100 - pct)) / pct)) : null;
            logger.info(`⏳ Progresso FFmpeg: ${pct}%${eta === null ? "" : ` (ETA ~${eta}s)`}`);
            lastPct = pct;
          }
        }
      }
    });

    ff.on("close", (code: number | null) => {
      clearInterval(keepAlive);
      clearTimeout(killer);
      if (timedOut) {
        reject(new Error(`FFmpeg was killed after the ${timeoutMs}ms timeout`));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });

  logger.info(`✅ Vídeo gerado com sucesso: ${outputPath}`);
};
