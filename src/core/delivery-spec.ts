/**
 * Delivery targets, ported from ffmpeg-skill's `scripts/_platforms.py`.
 *
 * One table states what the destination accepts (frame, fps, codecs, audio
 * rate, loudness, maximum length) so the encoder, the post-render loudness
 * pass and the quality gate all read the same numbers instead of restating
 * them in three places.
 *
 * A short is published to YouTube Shorts by default; the same file is also
 * accepted by Reels and TikTok, which have their own tighter limits.
 */
export interface DeliverySpec {
  /** Canonical destination name. */
  name: string;
  width: number;
  height: number;
  fps: number;
  /** Seconds; the platform's own maximum. */
  maxDuration: number;
  videoCodec: string;
  audioCodec: string;
  /** Platform standard for video delivery: 48 kHz, not 44.1. */
  sampleRate: number;
  /** Integrated loudness target (EBU R128). */
  lufs: number;
  /** Accepted distance from `lufs` before the file is out of spec. */
  lufsTolerance: number;
  /** True-peak ceiling in dBTP. */
  truePeak: number;
  /** Accepted drift between the length asked for and the file written, in seconds. */
  durationTolerance: number;
}

const SHORT_SPEC = {
  width: 1080, height: 1920, fps: 30, videoCodec: "h264", audioCodec: "aac",
  sampleRate: 48000, lufs: -14, lufsTolerance: 2, truePeak: -1, durationTolerance: 0.35,
};

export const DELIVERY_SPECS: Record<string, DeliverySpec> = {
  shorts: { ...SHORT_SPEC, name: "shorts", maxDuration: 180 },
  reels: { ...SHORT_SPEC, name: "reels", maxDuration: 90 },
  tiktok: { ...SHORT_SPEC, name: "tiktok", maxDuration: 600 },
  /**
   * Narrated/faceless videos: no Shorts length cap, and many concatenated
   * chapters each carry an AAC frame of rounding, so the drift allowance is wider.
   */
  custom: { ...SHORT_SPEC, name: "custom", maxDuration: 12 * 3600, durationTolerance: 2 },
};

/** Spellings people and existing manifests use for the same destination. */
const ALIASES: Record<string, string> = {
  "youtube-shorts": "shorts",
  "yt-shorts": "shorts",
  youtube: "shorts",
  instagram: "reels",
  ig: "reels",
};

/** Canonical destination name for a spelling, or undefined when it is unknown. */
export function resolveDeliverySpec(name?: string | null): DeliverySpec | undefined {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return undefined;
  return DELIVERY_SPECS[ALIASES[key] ?? key];
}

/** Destination the render is delivered to; `DELIVERY_PLATFORM`, default YouTube Shorts. */
export function activeDeliverySpec(): DeliverySpec {
  return resolveDeliverySpec(process.env.DELIVERY_PLATFORM) ?? DELIVERY_SPECS.shorts!;
}
