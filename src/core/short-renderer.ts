import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
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
import { assertShortMediaQuality } from "./short-quality.js";
import { buildFontEnv } from "./ffmpeg-env.js";
import { ffmpegBin } from "./ffmpeg-bin.js";

export { buildSafeFramingFilter } from "./short-framing.js";

const execFileAsync = promisify(execFile);

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
  const video = buildSafeFramingFilter(subtitlePath, config.verticalWidth, config.verticalHeight, logoPath, focus, {
    videoInput: plan.ranges ? "[cv]" : "[0:v]",
    cropBox: letterbox?.box,
    broll: { items: plan.broll, firstInputIndex: brollIndex },
  });
  const graph = [plan.ranges ? buildCutGraph(plan.ranges) : "", video, audio.graph].filter(Boolean).join(";");
  const isNvenc = config.videoEncoder.includes("nvenc");
  const qualityArgs = isNvenc ? ["-cq", "18"] : ["-crf", "18"];
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
    "-c:v", config.videoEncoder,
    "-preset", isNvenc ? "p7" : "slow",
    ...qualityArgs,
    "-profile:v", "high",
    "-level", "4.1",
    "-c:a", "aac",
    "-b:a", "256k",
    "-ar", "44100",
    "-movflags", "+faststart",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    outputPath,
  ];
  await runFfmpeg(args, outputPath);
  await assertShortMediaQuality(outputPath, {
    duration: clip.duration,
    width: config.verticalWidth,
    height: config.verticalHeight,
  });
}

async function runFfmpeg(args: string[], outputPath: string): Promise<void> {
  const bin = ffmpegBin();
  logger.debug({ command: [bin, ...args].join(" ") }, "FFmpeg started");
  try {
    const { stderr } = await execFileAsync(bin, args, {
      env: buildFontEnv(),
      maxBuffer: 100 * 1024 * 1024,
    });
    if (stderr) logger.debug({ stderr }, "FFmpeg stderr (informational)");
    verifyOutput(outputPath);
  } catch (err: any) {
    logger.error(
      { err, stderr: err.stderr, stdout: err.stdout, command: [bin, ...args].join(" ") },
      "FFmpeg CRASHED! O vídeo gerado provavelmente está corrompido ou vazio.",
    );
    throw new Error(`FFmpeg failed to render short: ${err.message}`);
  }
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
