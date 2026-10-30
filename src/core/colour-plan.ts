import { buildBt709Filter } from "./encode-settings.js";
import { buildTonemapFilter, isHdrTransfer, supportsTonemap } from "./hdr-tonemap.js";
import { logger } from "./logger.js";

/**
 * How to colour-correct a source into a BT.709 delivery (ffmpeg-skill `color.py`):
 * tone map a real HDR source, convert a BT.601 one with its own matrix, and never
 * relabel HDR pixels as SDR when this build cannot tone-map them.
 */
export interface ColourPlan {
  /** Filter prepended to the picture chain; "" when only tagging is needed. */
  filter: string;
  /** False when the source stays HDR: the encoder must not write BT.709 tags. */
  tagBt709: boolean;
}

export async function resolveColourPlan(
  colorSpace?: string,
  colorTransfer?: string,
  context = "delivery",
): Promise<ColourPlan> {
  if (!isHdrTransfer(colorTransfer)) return { filter: buildBt709Filter(colorSpace), tagBt709: true };
  if (await supportsTonemap()) return { filter: buildTonemapFilter(), tagBt709: true };
  logger.warn(
    { colorTransfer, context },
    "HDR source and this ffmpeg lacks zscale/tonemap: keeping the source colour tags instead of mislabelling SDR",
  );
  return { filter: "", tagBt709: false };
}
