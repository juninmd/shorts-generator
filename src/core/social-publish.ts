import fs from "node:fs";
import path from "node:path";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { PUBLISHERS } from "./publishers/index.js";
import type { PlatformName, SocialCopy } from "./publishers/types.js";

export interface SocialPostJobData {
  platform: PlatformName;
  /** File name inside the social directory; unguessable, so it can be served publicly. */
  publicName: string;
  copy: SocialCopy;
  outputDir: string;
  serverPublicUrl?: string;
}

const MAX_FILE_AGE_MS = 7 * 24 * 3600_000;

export const socialDir = (config: Pick<PipelineConfig, "outputDir">): string => path.join(config.outputDir, "social");

/** https URL the platform can pull the video from, or undefined without SERVER_PUBLIC_URL. */
export function publicVideoUrl(serverPublicUrl: string | undefined, publicName: string): string | undefined {
  return serverPublicUrl ? `${serverPublicUrl.replace(/\/+$/, "")}/public/social/${publicName}` : undefined;
}

/** Publishes one queued post to its platform and returns the post URL. */
export async function publishSocialPost(job: SocialPostJobData): Promise<string> {
  const publisher = PUBLISHERS[job.platform];
  const videoPath = path.join(socialDir(job), job.publicName);
  if (!fs.existsSync(videoPath)) throw new Error(`Social video not found: ${videoPath}`);
  const url = await publisher.publish({
    videoPath,
    videoUrl: publicVideoUrl(job.serverPublicUrl, job.publicName),
    copy: job.copy,
  });
  logger.info({ platform: job.platform, url }, "📣 Publicado em rede social");
  return url;
}

/** Removes queued-post copies older than a week (retries and delays are long past by then). */
export function pruneSocialFiles(config: Pick<PipelineConfig, "outputDir">, now = Date.now()): number {
  const dir = socialDir(config);
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (now - fs.statSync(file).mtimeMs > MAX_FILE_AGE_MS) {
      fs.unlinkSync(file);
      removed++;
    }
  }
  return removed;
}
