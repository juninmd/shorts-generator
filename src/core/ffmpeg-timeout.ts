/**
 * One ceiling for every ffmpeg/ffprobe call: a job that wedges must fail, not
 * hold the worker forever. Values Node cannot honour are rejected here rather
 * than silently becoming 1 ms (which would kill every run instantly).
 */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
/** Node clamps timers above this to 1 ms, so it is the real maximum. */
const MAX_TIMEOUT_MS = 2_147_483_647;
/** Below this the guard would abort normal work; treat it as a typo. */
const MIN_TIMEOUT_MS = 1000;

/** `FFMPEG_TIMEOUT_MS` clamped to a usable range; invalid or tiny values fall back to 30 min. */
export function ffmpegTimeoutMs(): number {
  const raw = Number.parseInt(process.env.FFMPEG_TIMEOUT_MS ?? "", 10);
  if (Number.isNaN(raw) || raw < MIN_TIMEOUT_MS) return DEFAULT_TIMEOUT_MS;
  return Math.min(raw, MAX_TIMEOUT_MS);
}
