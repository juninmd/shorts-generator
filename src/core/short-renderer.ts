import fs from "node:fs";
import type { PipelineConfig, ShortClip } from "../types.js";
import { logger } from "./logger.js";
import { resolveSpeakerFocus } from "./face-framing.js";
import type { FocusKeyframe } from "./focus-keyframes.js";
import { buildAudioRouting, pickBackgroundMusic } from "./audio-ducking.js";
import type { ResolvedBroll } from "./broll.js";
import { buildCutGraph } from "./cut-graph.js";
import { detectLetterbox, focusInBox, type LetterboxInfo } from "./letterbox.js";
import { detectSceneChanges } from "./scene-changes.js";
import { buildSafeFramingFilter } from "./short-framing.js";
import { remapKeyframes, type KeepRange } from "./silence-cuts.js";
import { finishDelivery } from "./short-delivery.js";
import { activeDeliverySpec } from "./delivery-spec.js";
import { buildAudioEncoderArgs, buildBt709Filter, buildVideoEncoderArgs } from "./encode-settings.js";
import { buildTonemapFilter, isHdrTransfer, supportsTonemap } from "./hdr-tonemap.js";
import { runFfmpeg } from "./ffmpeg-run.js";
import { probeVideoStream } from "./ffmpeg-bin.js";

export { buildSafeFramingFilter } from "./short-framing.js";

/** Edits applied while rendering; `clip` is already on the edited timeline. */
export interface EditPlan {
  /** Stretches of the original clip to keep (silence/filler cuts); absent = no cuts. */
  ranges?: KeepRange[];
  /** Duration of the clip before cutting: the span the speaker tracker must analyse. */
  sourceDuration: number;
  /** B-roll cutaways positioned on the edited timeline. */
  broll: ResolvedBroll[];
}

type Focus = number | FocusKeyframe[];

/** Colour conversion for the delivery: tone map HDR, convert BT.601, otherwise only tag BT.709. */
async function resolveColorFilter(colorSpace?: string, colorTransfer?: string): Promise<string> {
  if (!isHdrTransfer(colorTransfer)) return buildBt709Filter(colorSpace);
  if (await supportsTonemap()) return buildTonemapFilter();
  logger.warn(
    { colorTransfer },
    "HDR source and this ffmpeg lacks zscale/tonemap: the short keeps SDR BT.709 tags without a tone map",
  );
  return "";
}

/** Re-expresses the speaker position inside a cropped (letterboxed) frame and on the edited timeline. */
function adaptFocus(focus: Focus, letterbox: LetterboxInfo | null, ranges?: KeepRange[]): Focus {
  const inBox = (position: number) => (letterbox ? focusInBox(position, letterbox) : position);
  if (typeof focus === "number") return inBox(focus);
  const mapped = focus.map((keyframe) => ({ ...keyframe, x: inBox(keyframe.x) }));
  return ranges ? remapKeyframes(mapped, ranges) : mapped;
}

export async function renderShort(
  inputPath: string,
  outputPath: string,
  subtitlePath: string,
  clip: ShortClip,
  config: PipelineConfig,
  plan: EditPlan = { sourceDuration: clip.duration, broll: [] },
): Promise<void> {
  const spec = activeDeliverySpec();
  const logoPath = config.managedRun?.logoPath && fs.existsSync(config.managedRun.logoPath)
    ? config.managedRun.logoPath
    : null;
  const analysed = { startTime: clip.startTime, duration: plan.sourceDuration };
  const cuts = process.env.SPEAKER_TRACKING === "false" ? [] : await detectSceneChanges(inputPath, analysed.startTime, analysed.duration);
  const letterbox = await detectLetterbox(inputPath, analysed.startTime, analysed.duration);
  const focus = adaptFocus(await resolveSpeakerFocus(inputPath, analysed, cuts), letterbox, plan.ranges);
  const musicIndex = logoPath ? 2 : 1;
  const audio = buildAudioRouting(clip.duration, pickBackgroundMusic(), musicIndex, plan.ranges ? "[ca]" : "[0:a]");
  const brollIndex = musicIndex + (audio.inputArgs.length > 0 ? 1 : 0);
  // The delivery is tagged BT.709: a BT.601 source is converted, an HDR source tone-mapped,
  // instead of being mislabelled.
  const source = await probeVideoStream(inputPath);
  const colorFilter = await resolveColorFilter(source.color_space, source.color_transfer);
  const video = buildSafeFramingFilter(subtitlePath, config.verticalWidth, config.verticalHeight, logoPath, focus, {
    videoInput: plan.ranges ? "[cv]" : "[0:v]",
    cropBox: letterbox?.box,
    colorFilter,
    broll: { items: plan.broll, firstInputIndex: brollIndex },
  });
  const graph = [plan.ranges ? buildCutGraph(plan.ranges) : "", video, audio.graph].filter(Boolean).join(";");
  const args = [
    "-ss", String(clip.startTime),
    "-i", inputPath,
    ...(logoPath ? ["-i", logoPath] : []),
    ...audio.inputArgs,
    ...plan.broll.flatMap((item) => ["-t", String(item.duration), "-i", item.path]),
    "-y",
    "-filter_complex", graph,
    "-map", "[v]",
    ...audio.outputArgs,
    "-t", String(clip.duration),
    ...buildVideoEncoderArgs({ encoder: config.videoEncoder, spec }),
    ...buildAudioEncoderArgs(spec),
    "-movflags", "+faststart",
    outputPath,
  ];
  logger.debug({ command: [config.videoEncoder, ...args].join(" ") }, "FFmpeg started");
  try {
    const { stderr } = await runFfmpeg(args, { outputPath });
    if (stderr) logger.debug({ stderr }, "FFmpeg stderr (informational)");
  } catch (err) {
    logger.error(
      { err, command: args.join(" ") },
      "FFmpeg CRASHED! O vídeo gerado provavelmente está corrompido ou vazio.",
    );
    throw new Error(`FFmpeg failed to render short: ${(err as Error).message}`);
  }
  verifyOutput(outputPath);
  await finishDelivery(outputPath, {
    duration: clip.duration,
    width: config.verticalWidth,
    height: config.verticalHeight,
  }, spec);
}

function verifyOutput(outputPath: string): void {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`FFmpeg finished but output file is missing: ${outputPath}`);
  }
  const stats = fs.statSync(outputPath);
  if (stats.size < 100 * 1024) {
    throw new Error(
      `FFmpeg output is too small (${(stats.size / 1024).toFixed(1)}KB). Video is likely corrupted.`,
    );
  }
  logger.debug({ outputPath, size: stats.size }, "Video integrity verified");
}
