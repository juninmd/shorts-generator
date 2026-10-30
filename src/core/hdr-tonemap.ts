import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ffmpegBin } from "./ffmpeg-bin.js";

const execFileAsync = promisify(execFile);

/**
 * HDR → SDR for a BT.709 delivery (ffmpeg-skill `color.py --to-sdr`): a PQ or
 * HLG source tagged BT.709 without conversion plays washed out and grey, so it
 * is tone-mapped when the build has `zscale`/`tonemap`. The capability is read
 * once per process, and an unsupported build is reported, not silently mislabelled.
 */

/** Transfers that mean the picture is HDR (PQ / HLG). */
export function isHdrTransfer(transfer?: string | null): boolean {
  const value = (transfer ?? "").trim().toLowerCase();
  return value === "smpte2084" || value === "arib-std-b67";
}

/** Linear-light tone map to SDR BT.709; the chain expects 10-bit or better input. */
export function buildTonemapFilter(): string {
  return [
    "zscale=t=linear:npl=100",
    "format=gbrpf32le",
    "zscale=p=bt709",
    "tonemap=tonemap=hable:desat=0",
    "zscale=t=bt709:m=bt709:r=tv",
    "format=yuv420p",
  ].join(",") + ",";
}

/** True when ffmpeg's filter listing carries both filters the tone map needs. */
export function hasTonemapFilters(listing: string): boolean {
  return /(^|\s)zscale(\s|$)/m.test(listing) && /(^|\s)tonemap(\s|$)/m.test(listing);
}

let tonemapSupport: boolean | undefined;

/** Forget the cached capability answer (tests and long-lived workers after a ffmpeg swap). */
export function resetTonemapCache(): void {
  tonemapSupport = undefined;
}

/** Detect once whether this ffmpeg can tone-map; a failed listing is "not supported". */
export async function supportsTonemap(): Promise<boolean> {
  if (tonemapSupport !== undefined) return tonemapSupport;
  try {
    const { stdout } = await execFileAsync(ffmpegBin(), ["-hide_banner", "-filters"], {
      maxBuffer: 8 * 1024 * 1024,
    });
    tonemapSupport = hasTonemapFilters(String(stdout));
  } catch {
    tonemapSupport = false;
  }
  return tonemapSupport;
}
