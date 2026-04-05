/* v8 ignore start */
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { execYtDlp, getYtDlpBaseArgs, withCookies } from "./youtube-base.js";

/**
 * Perform a pre-flight check to see if YouTube is blocking us.
 */
export async function verifyYoutubeAccess(config: PipelineConfig): Promise<void> {
  logger.info("Performing YouTube access check...");
  const testUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
  
  return withCookies(config, async (tempCookiePath) => {
    try {
      const { stdout } = await execYtDlp([
        ...getYtDlpBaseArgs(config, tempCookiePath),
        "--list-formats",
        "--no-playlist",
        "--no-warnings",
        "--",
        testUrl
      ], { timeout: 45_000 });
      
      if (stdout.includes("ID") && stdout.includes("EXT")) {
        logger.info("YouTube access check passed.");
        return;
      }
      throw new Error("Formats not found");
    } catch (error: any) {
      const msg = error.stderr || error.message || "";
      if (msg.includes("bot") || msg.includes("403") || msg.includes("blocked")) {
        throw new Error("YouTube is blocking this environment. Update cookies.");
      }
      throw new Error(`YouTube access check failed: ${msg.slice(0, 100)}`);
    }
  });
}
