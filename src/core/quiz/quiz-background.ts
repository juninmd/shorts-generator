import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ffmpegBin } from "../ffmpeg-bin.js";
import { logger } from "../logger.js";
import { normalizePath } from "./quiz-assets.service.js";

/**
 * Quiz background selection. Hand-made 9:16 art (dark centre, decorated edges)
 * wins over the generated gradient: it gives every video its own look without
 * re-encoding an image into video, and it already provides the text area, so the
 * frame does not paint a second panel over the art.
 */

export interface QuizBackground {
  /** Input 0 path. */
  path: string;
  kind: "image" | "video";
  /** True when the image already draws its own dark text area. */
  hasPanel: boolean;
  /** For the log: file name or the gradient palette. */
  source: string;
}

export const QUIZ_BACKGROUND_DIR = "assets/backgrounds/quiz";
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Random image from the art folder; null when the folder is absent or empty. */
export function pickBackgroundImage(dir = process.env.QUIZ_BACKGROUND_DIR || QUIZ_BACKGROUND_DIR): string | null {
  if (!dir || !fs.existsSync(dir)) return null;
  const images = fs.readdirSync(dir).filter((name) => IMAGE_EXT.test(name)).sort();
  if (images.length === 0) return null;
  return path.join(dir, images[Math.floor(Math.random() * images.length)]!);
}

// Distinct color pairs so every video gets its own look — identical backgrounds
// across uploads feed YouTube's templated/mass-produced content detection. All of
// them are mid-bright: a near-black pair reads as a dead frame behind the panel.
const GRADIENT_PALETTES: Array<[string, string]> = [
  ["0x223c7a", "0xb21f1f"], ["0x134e5e", "0x71b280"], ["0x42275a", "0x734b6d"],
  ["0x3a1c71", "0xd76d77"], ["0x1d4350", "0xa43931"], ["0x2c3e50", "0x6f9fb3"],
  ["0x11998e", "0x0b3866"], ["0x5a2a27", "0xc9843c"],
];

/**
 * Animated gradient fallback: rendered larger than the frame and slowly cropped
 * with a sine drift, so the motion is continuous (no loop seam).
 */
function renderGradient(tempDir: string, durationSec: number): string {
  const [c0, c1] = GRADIENT_PALETTES[Math.floor(Math.random() * GRADIENT_PALETTES.length)]!;
  const bgVideo = path.join(tempDir, "bg_gradient.mp4");
  const drift = "crop=1080:1920:'(in_w-1080)/2+36*sin(t/7)':'(in_h-1920)/2+42*cos(t/9)'";
  const render = spawnSync(ffmpegBin(), [
    "-y", "-hide_banner", "-nostdin", "-f", "lavfi",
    "-i", `gradients=s=1188x2112:c0=${c0}:c1=${c1}:speed=0.02:r=30`,
    "-t", String(Math.ceil(durationSec) + 1),
    "-vf", `${drift},eq=brightness=0.05:saturation=1.12:contrast=1.04,noise=alls=3:allf=t,vignette=PI/5`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-g", "60",
    normalizePath(bgVideo),
  ]);
  if (render.status === 0 && fs.existsSync(bgVideo)) return bgVideo;

  logger.warn({ stderr: render.stderr?.toString().slice(-400) }, "Fundo animado falhou — usando fallback estático");
  let fallback = path.resolve("assets/backgrounds/neon.png");
  if (!fs.existsSync(fallback)) {
    fallback = path.join(tempDir, "bg_default.jpg");
    if (!fs.existsSync(fallback)) {
      spawnSync(ffmpegBin(), ["-y", "-f", "lavfi", "-i", "color=c=darkblue:s=1080x1920:d=1", "-frames:v", "1", normalizePath(fallback)]);
    }
  }
  return fallback;
}

/** Art from the quiz folder when there is any, otherwise a generated gradient. */
export function prepareQuizBackground(tempDir: string, durationSec = 60): QuizBackground {
  const image = pickBackgroundImage();
  if (image) {
    logger.info({ image }, "Usando arte de fundo do quiz");
    return { path: image, kind: "image", hasPanel: true, source: path.basename(image) };
  }
  const generated = renderGradient(tempDir, durationSec);
  const isImage = IMAGE_EXT.test(generated);
  return {
    path: generated,
    kind: isImage ? "image" : "video",
    hasPanel: false,
    source: isImage ? path.basename(generated) : "gradient",
  };
}
