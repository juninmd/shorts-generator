import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Env for ffmpeg child processes so drawtext/subtitles filters find fonts.conf. */
export function buildFontEnv(): NodeJS.ProcessEnv {
  const fontsConfNative = path.resolve(process.cwd(), "fonts.conf");
  const fontsConfFwd = fontsConfNative.replace(/\\/g, "/");
  const cacheDir = path.join(os.homedir(), ".cache", "fontconfig");
  if (fs.existsSync(fontsConfNative)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return {
    ...process.env,
    FONTCONFIG_FILE: fs.existsSync(fontsConfNative) ? fontsConfFwd : undefined,
  };
}
