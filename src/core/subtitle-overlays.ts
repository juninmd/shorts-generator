import type { BrandTemplate } from "./brand-template.js";
import { escapeAssText, formatASSTime } from "./subtitle-format.js";

const HOOK_LINE_CHARS = 22;
const HOOK_MAX_LINES = 3;

/** Greedy word wrap into at most HOOK_MAX_LINES lines (ASS `\N` separated), ellipsised when cut. */
export function wrapHook(title: string): string {
  const lines: string[] = [];
  for (const word of title.trim().split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= HOOK_LINE_CHARS) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length <= HOOK_MAX_LINES) return lines.map(escapeAssText).join("\\N");
  const kept = lines.slice(0, HOOK_MAX_LINES);
  kept[HOOK_MAX_LINES - 1] = `${kept[HOOK_MAX_LINES - 1]}…`;
  return kept.map(escapeAssText).join("\\N");
}

const dialogue = (start: number, end: number, style: string, text: string): string =>
  `Dialogue: 1,${formatASSTime(start)},${formatASSTime(end)},${style},,0,0,0,,${text}`;

/** Title card over the first seconds (the "hook"): pops in, fades out. */
export function hookEvent(title: string, brand: BrandTemplate): string {
  const text = `{\\fad(150,300)\\fscx92\\fscy92\\t(0,220,\\fscx100\\fscy100)}${wrapHook(title)}`;
  return dialogue(0.15, brand.hookSeconds, "Hook", text);
}

/** Closing call to action over the last seconds. */
export function ctaEvent(clipDuration: number, brand: BrandTemplate): string {
  const start = Math.max(0, clipDuration - brand.ctaSeconds);
  const text = `{\\fad(200,0)\\fscx85\\fscy85\\t(0,260,\\fscx100\\fscy100)}${escapeAssText(brand.cta)}`;
  return dialogue(start, clipDuration, "Cta", text);
}

/** Presenter name tag sliding in from the left, shortly after the start. */
export function lowerThirdEvent(name: string, height: number): string {
  const y = Math.round(height * 0.72);
  const text = `{\\move(-500,${y},60,${y},0,350)\\fad(0,250)}${escapeAssText(name)}`;
  return dialogue(0.9, 4.6, "LowerThird", text);
}
