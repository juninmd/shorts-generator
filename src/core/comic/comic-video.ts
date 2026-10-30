import fs from "node:fs";
import path from "node:path";
import type { NarratedChapter } from "./comic-types.js";
import { logger } from "../logger.js";
import { buildDuckingGraph } from "../audio-ducking.js";
import { runFfmpeg } from "../ffmpeg-run.js";
import { probeVideoStream } from "../ffmpeg-bin.js";
import { resolveColourPlan } from "../colour-plan.js";
import {
  AUDIO_SAMPLE_RATE,
  buildAudioEncoderArgs,
  buildVideoEncoderArgs,
} from "../encode-settings.js";
import { DELIVERY_SPECS } from "../delivery-spec.js";

const SPEC = DELIVERY_SPECS.custom!;

function escapeFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/**
 * Render one chapter: still image + narration audio, with a slow Ken Burns
 * zoom so a static comic page doesn't feel dead on video. Chapter clips are an
 * intermediate, so they are encoded at delivery quality to limit generation loss
 * when the final burn re-encodes them.
 */
export async function renderChapterClip(
  chapter: NarratedChapter,
  outputPath: string,
  width: number,
  height: number,
): Promise<void> {
  if (chapter.videoPath) return renderFootageClip(chapter, chapter.videoPath, outputPath, width, height);
  const frames = Math.max(1, Math.round(chapter.durationSec * 30));
  const zoomFilter =
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,` +
    `crop=${width * 2}:${height * 2},` +
    `zoompan=z='min(zoom+0.0006,1.15)':d=${frames}:s=${width}x${height}:fps=30`;

  const args = [
    "-y",
    "-loop", "1",
    "-i", chapter.imagePath,
    "-i", chapter.audioPath,
    "-vf", zoomFilter,
    "-t", String(chapter.durationSec),
    ...buildVideoEncoderArgs({ encoder: "libx264", spec: SPEC, quality: 18 }),
    ...buildAudioEncoderArgs(SPEC),
    "-shortest",
    outputPath,
  ];
  await runFfmpeg(args, { outputPath, maxBufferBytes: 16 * 1024 * 1024 });
}

/** Faceless chapter: looped stock footage cropped to vertical, under the narration. */
async function renderFootageClip(
  chapter: NarratedChapter,
  videoPath: string,
  outputPath: string,
  width: number,
  height: number,
): Promise<void> {
  // The chapter is encoded as a delivery too, so an HDR or SD stock clip is not mislabelled.
  const source = await probeVideoStream(videoPath);
  const colour = await resolveColourPlan(source.color_space, source.color_transfer, "comic-footage");
  const fit = `${colour.filter}scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30`;
  const args = [
    "-y",
    "-stream_loop", "-1",
    "-i", videoPath,
    "-i", chapter.audioPath,
    "-vf", fit,
    "-map", "0:v",
    "-map", "1:a",
    "-t", String(chapter.durationSec),
    ...buildVideoEncoderArgs({ encoder: "libx264", spec: SPEC, quality: 18, tagBt709: colour.tagBt709 }),
    ...buildAudioEncoderArgs(SPEC),
    outputPath,
  ];
  await runFfmpeg(args, { outputPath, maxBufferBytes: 16 * 1024 * 1024 });
}

/** Concatenate rendered chapter clips into a single video via the concat demuxer. */
export async function concatChapterClips(
  clipPaths: string[],
  outputPath: string,
  workDir: string,
): Promise<void> {
  const listPath = path.join(workDir, "concat-list.txt");
  const listContent = clipPaths
    .map((clipPath) => `file '${path.resolve(clipPath).replace(/\\/g, "/")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listContent, "utf-8");

  const args = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    "-movflags", "+faststart",
    outputPath,
  ];
  await runFfmpeg(args, { outputPath, maxBufferBytes: 16 * 1024 * 1024 });
}

/**
 * Burn ASS subtitles onto the concatenated video. With a music track, the
 * narration is mixed over it and the music ducks whenever the narrator speaks.
 * The final re-encode is a delivery encode: a chapter that kept HDR tags is
 * tone-mapped (or kept HDR) here, never relabelled as BT.709.
 */
export async function burnSubtitles(
  inputPath: string,
  subtitlePath: string,
  outputPath: string,
  music?: { path: string; durationSec: number },
): Promise<void> {
  const subtitles = `subtitles='${escapeFilterPath(subtitlePath)}'`;
  const source = await probeVideoStream(inputPath);
  const colour = await resolveColourPlan(source.color_space, source.color_transfer, "comic-burn");
  const encode = buildVideoEncoderArgs({ encoder: "libx264", spec: SPEC, quality: 20, tagBt709: colour.tagBt709 });
  const audio = buildAudioEncoderArgs(SPEC);
  const args = music
    ? [
      "-y",
      "-i", inputPath,
      "-stream_loop", "-1",
      "-i", music.path,
      "-filter_complex", `[0:v]${colour.filter}${subtitles}[v];${buildDuckingGraph({
        speechInput: "[0:a]", musicInput: "[1:a]", duration: music.durationSec,
      })}`,
      "-map", "[v]",
      "-map", "[aout]",
      "-t", String(music.durationSec),
      ...encode,
      ...audio,
      "-movflags", "+faststart",
      outputPath,
    ]
    : [
      "-y",
      "-i", inputPath,
      "-vf", `${colour.filter}${subtitles}`,
      ...encode,
      // No music to mix: the narration is already AAC at the delivery rate.
      "-c:a", "copy",
      "-movflags", "+faststart",
      outputPath,
    ];
  logger.info({ inputPath, outputPath, music: music?.path, sampleRate: AUDIO_SAMPLE_RATE }, "Burning comic subtitles");
  await runFfmpeg(args, { outputPath, maxBufferBytes: 16 * 1024 * 1024 });
}
