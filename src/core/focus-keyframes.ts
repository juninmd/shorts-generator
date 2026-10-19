export interface FocusKeyframe {
  /** Seconds from the start of the clip. */
  t: number;
  /** Horizontal speaker position: 0 = left edge, 1 = right edge. */
  x: number;
}

const MAX_KEYFRAMES = 16;
const PAN_SECONDS = 0.3;
const BIG_JUMP = 0.15;
const CUT_GUARD = 0.04;

/** Median of each sample with its neighbours; the two ends keep their own value. */
function median3(samples: FocusKeyframe[]): FocusKeyframe[] {
  return samples.map((sample, index) => {
    const before = samples[index - 1];
    const after = samples[index + 1];
    if (!before || !after) return sample;
    return { t: sample.t, x: [before.x, sample.x, after.x].sort((a, b) => a - b)[1]! };
  });
}

function dropSmallMoves(samples: FocusKeyframe[], deadZone: number, cuts: number[]): FocusKeyframe[] {
  const kept: FocusKeyframe[] = [samples[0]!];
  for (const sample of samples.slice(1)) {
    const last = kept.at(-1)!;
    const jump = Math.abs(sample.x - last.x);
    if (jump <= deadZone) continue;
    const cut = cuts.find((time) => time > last.t + CUT_GUARD && time <= sample.t);
    if (jump > BIG_JUMP && cut !== undefined) {
      // A camera cut: jump with it rather than panning across the shot change.
      kept.push({ t: cut - CUT_GUARD, x: last.x }, { t: cut, x: sample.x });
    } else if (jump > BIG_JUMP && sample.t - last.t > PAN_SECONDS) {
      // A speaker change pans quickly instead of drifting slowly across the gap.
      kept.push({ t: sample.t - PAN_SECONDS, x: last.x });
    }
    kept.push(sample);
  }
  return kept;
}

/**
 * Turns raw per-sample speaker positions into a short, smooth list of
 * keyframes: median-filters outliers, ignores sub-dead-zone jitter, and widens
 * the dead zone until the list fits the FFmpeg expression budget. Camera cuts
 * (seconds from the clip start) make the crop jump instead of pan.
 */
export function simplifyKeyframes(samples: FocusKeyframe[], cuts: number[] = []): FocusKeyframe[] {
  if (samples.length === 0) return [];
  const smooth = median3([...samples].sort((a, b) => a.t - b.t));
  let deadZone = 0.03;
  let kept = dropSmallMoves(smooth, deadZone, cuts);
  while (kept.length > MAX_KEYFRAMES) {
    deadZone *= 1.6;
    kept = dropSmallMoves(smooth, deadZone, cuts);
  }
  return kept;
}

/** Parses the tracker's JSON output; any malformed entry invalidates it. */
export function parseTrackerOutput(raw: string): FocusKeyframe[] {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) return [];
  const samples: FocusKeyframe[] = [];
  for (const entry of data) {
    const [t, x] = Array.isArray(entry) ? entry : [];
    if (!Number.isFinite(t) || !Number.isFinite(x)) return [];
    samples.push({ t, x: Math.max(0, Math.min(1, x)) });
  }
  return samples;
}

/**
 * ffmpeg expression (variable `t`) giving the speaker position, linearly
 * interpolated between keyframes and held flat outside them.
 */
export function buildFocusExpression(keyframes: FocusKeyframe[]): string {
  const num = (value: number) => value.toFixed(4);
  let expression = num(keyframes.at(-1)!.x);
  for (let i = keyframes.length - 2; i >= 0; i--) {
    const from = keyframes[i]!;
    const to = keyframes[i + 1]!;
    const slope = `${num(from.x)}+(${num(to.x - from.x)})*(t-${num(from.t)})/${num(Math.max(to.t - from.t, 0.001))}`;
    expression = `if(lt(t\\,${num(to.t)})\\,${slope}\\,${expression})`;
  }
  const first = keyframes[0]!;
  return keyframes.length === 1
    ? expression
    : `if(lt(t\\,${num(first.t)})\\,${num(first.x)}\\,${expression})`;
}
