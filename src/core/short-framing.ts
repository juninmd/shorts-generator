import { CENTER_FOCUS, buildCropXExpression, edgePadFilter } from "./face-framing.js";
import type { FocusKeyframe } from "./focus-keyframes.js";
import { buildBrollGraph, type ResolvedBroll } from "./broll.js";
import type { CropBox } from "./letterbox.js";

export interface FramingLayout {
  /** Video input label; "[cv]" when silence cuts were concatenated first. */
  videoInput?: string;
  /** Baked-in black bars to crop away before framing. */
  cropBox?: CropBox | null;
  /** Cutaways overlaid under the captions; inputs start at `firstInputIndex`. */
  broll?: { items: ResolvedBroll[]; firstInputIndex: number };
}

export function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

export function buildSafeFramingFilter(
  subtitlePath: string,
  width: number,
  height: number,
  logoPath?: string | null,
  focus: number | FocusKeyframe[] = CENTER_FOCUS,
  layout: FramingLayout = {},
): string {
  const assPath = escapeFilterPath(subtitlePath);
  // Horizontal crop offset biased toward the speaker (a fixed 0..1 position or
  // tracked keyframes that pan between speakers); clamped to stay inside the frame.
  const cropX = buildCropXExpression(width, focus);
  // Gentle "breathing" punch-in (up to +7% over an 8s cycle): constant subtle
  // motion counters the static-pulpit retention drop without distracting from
  // the speaker. Applied before subtitles so caption text stays fixed.
  const punchIn = `scale=w='ceil(iw*(1+0.07*pow(sin(PI*t/8),2))/2)*2':h=-2:eval=frame:flags=lanczos,crop=${width}:${height}:(in_w-${width})/2:(in_h-${height})/2`;
  const box = layout.cropBox ? `crop=${layout.cropBox.width}:${layout.cropBox.height}:${layout.cropBox.x}:${layout.cropBox.y},` : "";
  const framed = `${layout.videoInput ?? "[0:v]"}${box}scale=w='if(gt(iw/ih,${width}/${height}),-1,${width})':h='if(gt(iw/ih,${width}/${height}),${height},-1)':flags=lanczos+accurate_rnd,${edgePadFilter(width)},crop=${width}:${height}:${cropX}:(in_h-${height})/2,${punchIn},hqdn3d=1.5:1.5:3:3,unsharp=3:3:0.5:3:3:0.5,setsar=1`;
  const subtitled = `ass='${assPath}'[base]`;
  const items = layout.broll?.items ?? [];
  const baseVideo = items.length === 0
    ? `${framed},${subtitled}`
    : `${framed}[pre];${buildBrollGraph("[pre]", "[bro]", items, layout.broll!.firstInputIndex, width, height)};[bro]${subtitled}`;
  if (!logoPath) {
    return `${baseVideo};[base]copy[v]`;
  }
  return `${baseVideo};[1:v]scale=180:-1[logo];[base][logo]overlay=W-w-36:36[v]`;
}
