import { bluesky } from "./bluesky.js";
import { instagram } from "./instagram.js";
import { pinterest } from "./pinterest.js";
import { threads } from "./threads.js";
import { tiktok } from "./tiktok.js";
import type { PlatformName, Publisher } from "./types.js";

export const PUBLISHERS: Record<PlatformName, Publisher> = { bluesky, instagram, threads, tiktok, pinterest };

/**
 * Platforms to post to: PUBLISH_PLATFORMS (comma list) or, when unset, every
 * platform whose credentials are present. Unknown or unconfigured names are skipped.
 */
export function configuredPublishers(): Publisher[] {
  const requested = (process.env.PUBLISH_PLATFORMS ?? "").split(",").map((name) => name.trim().toLowerCase()).filter(Boolean);
  const candidates = requested.length > 0
    ? requested.map((name) => PUBLISHERS[name as PlatformName]).filter((publisher): publisher is Publisher => Boolean(publisher))
    : Object.values(PUBLISHERS);
  return candidates.filter((publisher) => publisher.configured());
}
