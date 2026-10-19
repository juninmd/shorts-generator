import type { KeepRange } from "./silence-cuts.js";

const FADE = 0.015;

/**
 * filter_complex fragment that concatenates the kept ranges of input 0 into
 * [cv]/[ca]. Each audio piece gets a tiny fade at both ends so joins never click.
 */
export function buildCutGraph(ranges: KeepRange[]): string {
  const pieces = ranges.map((range, index) => {
    const length = (range.end - range.start).toFixed(3);
    const { start, end } = { start: range.start.toFixed(3), end: range.end.toFixed(3) };
    return [
      `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[cv${index}]`,
      `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,afade=t=in:d=${FADE},afade=t=out:st=${Math.max(0, Number(length) - FADE).toFixed(3)}:d=${FADE}[ca${index}]`,
    ].join(";");
  });
  const inputs = ranges.map((_, index) => `[cv${index}][ca${index}]`).join("");
  return `${pieces.join(";")};${inputs}concat=n=${ranges.length}:v=1:a=1[cv][ca]`;
}
