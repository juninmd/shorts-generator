/* v8 ignore start */
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import { getYtDlpBaseArgs, withCookies, execYtDlp } from "./youtube-base.js";

/**
 * Perform a pre-flight check to see if YouTube is blocking us.
 * Returns true if okay, throws error if blocked.
 */
export async function verifyYoutubeAccess(config: PipelineConfig): Promise<void> {
  logger.info("Performing YouTube access sanity check...");
  
  // Use Big Buck Bunny - very standard video for tests
  const testUrl = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
  
  return withCookies(config, async (tempCookiePath) => {
    try {
      // Try to get available formats. 
      // If we can't even see formats, the actual download will 100% fail.
      const { stdout } = await execYtDlp([
        ...getYtDlpBaseArgs(config, tempCookiePath),
        "--list-formats",
        "--no-playlist",
        "--no-warnings",
        "--",
        testUrl
      ], { timeout: 45_000 });
      
      // If we see IDs in the output, it means we reached the format list
      if (stdout.includes("ID") && stdout.includes("EXT")) {
        logger.info("YouTube format access check passed.");
        return;
      }
      throw new Error("YouTube formats not found in response.");
    } catch (error: any) {
      const msg = error.stderr || error.message || "";
      const lowerMsg = msg.toLowerCase();
      
      if (lowerMsg.includes("sign in to confirm you are not a bot") || 
          lowerMsg.includes("confirm your age") ||
          lowerMsg.includes("403: forbidden") ||
          lowerMsg.includes("blocked") ||
          lowerMsg.includes("unsupported url")) {
        throw new Error("YouTube is blocking this environment (Bot Detection). Update your YOUTUBE_COOKIES_BASE64.");
      }
      
      // If it's a format error, it's pretty much a block in GH Actions
      if (lowerMsg.includes("no video formats found")) {
        throw new Error("YouTube is blocking streaming access from this IP. (No formats found).");
      }
      
      const lines = msg.split("\n");
      const errorLine = lines.find((l: string) => l.includes("ERROR:")) || lines[0];
      throw new Error(`YouTube access check failed: ${errorLine}`);
    }
  });
}
/* v8 ignore stop */
