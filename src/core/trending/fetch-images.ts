import fs from "node:fs";
import path from "node:path";
import type { FetchLike } from "./github-trending.js";
import type { ReadmeImage } from "./readme.js";
import { logger } from "../logger.js";

export interface LocalImage {
  alt: string;
  url: string;
  path: string;
}

function extensionOf(url: string): string {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ext === ".jpeg" ? ".jpg" : ext;
}

/**
 * Downloads the README images that will become chapters. Failed downloads are
 * skipped, so one broken link does not sink the whole short.
 */
export async function downloadImages(
  images: ReadmeImage[],
  dir: string,
  limit: number,
  fetchImpl: FetchLike = fetch,
): Promise<LocalImage[]> {
  fs.mkdirSync(dir, { recursive: true });
  const local: LocalImage[] = [];
  for (const image of images) {
    if (local.length >= limit) break;
    const target = path.join(dir, `shot-${local.length + 1}${extensionOf(image.url)}`);
    try {
      const response = await fetchImpl(image.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
      local.push({ alt: image.alt, url: image.url, path: target });
    } catch (error) {
      logger.warn({ error, url: image.url }, "Skipping README image that failed to download");
    }
  }
  return local;
}
