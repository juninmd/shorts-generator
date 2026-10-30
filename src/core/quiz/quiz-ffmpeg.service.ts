import { spawn } from "node:child_process";
import fs from "node:fs";
import { normalizePath } from "./quiz-assets.service.js";
import { logger } from "../logger.js";
import { ffmpegBin } from "../ffmpeg-bin.js";
import { ffmpegTimeoutMs } from "../ffmpeg-timeout.js";
import { buildAudioEncoderArgs, buildVideoEncoderArgs } from "../encode-settings.js";
import { DELIVERY_SPECS } from "../delivery-spec.js";

/** A quiz is a delivery like any other short, without a Shorts length cap. */
const QUIZ_SPEC = DELIVERY_SPECS.custom!;

const hmsToSeconds = (hms: string): number => {
  const parts = hms.split(":").reverse();
  const s = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const h = Number(parts[2]) || 0;
  return h * 3600 + m * 60 + s;
};

/** A partial file we cannot remove is not a reason to lose the real error. */
const removePartial = (filePath: string): void => {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // ignored on purpose: the rejection carries the real cause
  }
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
    "-tune", "fastdecode,zerolatency",
    "-filter_threads", "2",
    // Same encoder line as a short: this build ignores the generic -color_* options,
    // so only the x264 params actually tag the quiz BT.709.
    ...buildVideoEncoderArgs({ encoder: "libx264", spec: QUIZ_SPEC, quality: 23, preset: "veryfast" }),
    ...buildAudioEncoderArgs(QUIZ_SPEC, 192),
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
    let settled = false;
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
    // Do not keep an idle process alive for up to 30 minutes after a failed spawn.
    killer.unref();

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
      if (settled) return;
      settled = true;
      clearInterval(keepAlive);
      clearTimeout(killer);
      if (timedOut) {
        removePartial(outputPath);
        reject(new Error(`FFmpeg was killed after the ${timeoutMs}ms timeout`));
      } else if (code === 0) {
        resolve();
      } else {
        // A truncated mp4 must not sit where the next stage looks for a deliverable.
        removePartial(outputPath);
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    // A bad FFMPEG_PATH emits 'error' instead of 'close'; without a listener that
    // is an uncaught exception that kills the worker instead of failing the job.
    ff.on("error", (error: Error) => {
      // A late error after a successful close must not delete the finished file.
      if (settled) return;
      settled = true;
      clearInterval(keepAlive);
      clearTimeout(killer);
      removePartial(outputPath);
      reject(new Error(`FFmpeg failed to start: ${error.message}`));
    });
  });

  logger.info(`✅ Vídeo gerado com sucesso: ${outputPath}`);
};
