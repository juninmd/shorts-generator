import { loadConfig } from "../src/core/config.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../src/core/logger.js";
import { createModel } from "../src/core/ai-provider.js";
import { hasTonemapFilters } from "../src/core/hdr-tonemap.js";
import { ffmpegBin, ffprobeBin } from "../src/core/ffmpeg-bin.js";

const execFileAsync = promisify(execFile);

async function checkFfmpeg() {
  try {
    const { stdout } = await execFileAsync(ffmpegBin(), ["-version"]);
    logger.info("✅ FFmpeg found: " + stdout.split("\n")[0]);
    return true;
  } catch (err) {
    logger.error("❌ FFmpeg NOT found in PATH");
    return false;
  }
}

async function checkFfprobe() {
  try {
    const { stdout } = await execFileAsync(ffprobeBin(), ["-version"]);
    logger.info("✅ FFprobe found: " + stdout.split("\n")[0]);
    return true;
  } catch (err) {
    logger.error("❌ FFprobe NOT found in PATH");
    return false;
  }
}

async function checkAI() {
  const config = loadConfig();
  logger.info(`Checking LiteLLM-compatible model configuration: ${config.aiModel}`);

  try {
    const model = createModel(config);
    logger.info(`✅ AI model configured at ${new URL(config.litellmBaseUrl).origin}`);
  } catch (err: any) {
    logger.error("❌ Failed to configure AI model: " + err.message);
    return false;
  }
  return true;
}

async function checkDirectories() {
  const config = loadConfig();
  try {
    fs.mkdirSync(config.outputDir, { recursive: true });
    const testFile = path.join(config.outputDir, ".smoke-test");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    logger.info(`✅ Output directory is writable: ${config.outputDir}`);
    return true;
  } catch (err: any) {
    logger.error(`❌ Output directory error: ${err.message}`);
    return false;
  }
}

/** Encoders and filters a delivery render needs (ffmpeg-skill's `doctor`, reduced to what we use). */
const REQUIRED_ENCODERS = ["libx264", "aac"];
const REQUIRED_FILTERS = ["ass", "loudnorm", "colorspace", "hqdn3d", "unsharp", "sidechaincompress"];

const listed = (listing: string, name: string): boolean => new RegExp(`(^|\\s)${name}(\\s|$)`, "m").test(listing);

async function checkDeliveryCapabilities() {
  try {
    const [encoders, filters] = await Promise.all([
      execFileAsync(ffmpegBin(), ["-hide_banner", "-encoders"]),
      execFileAsync(ffmpegBin(), ["-hide_banner", "-filters"]),
    ]);
    const missing = [
      ...REQUIRED_ENCODERS.filter((name) => !listed(String(encoders.stdout), name)).map((name) => `encoder ${name}`),
      ...REQUIRED_FILTERS.filter((name) => !listed(String(filters.stdout), name)).map((name) => `filter ${name}`),
    ];
    if (missing.length > 0) {
      logger.error("❌ FFmpeg is missing what the delivery needs: " + missing.join(", "));
      return false;
    }
    // Only an HDR source needs these; without them the render warns and keeps SDR tags.
    if (!hasTonemapFilters(String(filters.stdout))) {
      logger.warn("⚠️ zscale/tonemap ausentes: fontes HDR não serão tone-mapped (shorts SDR seguem iguais)");
    }
    logger.info("✅ Delivery encoders/filters present: " + [...REQUIRED_ENCODERS, ...REQUIRED_FILTERS].join(", "));
    return true;
  } catch (err: any) {
    logger.error("❌ Failed to read FFmpeg capabilities: " + err.message);
    return false;
  }
}

async function runSmokeTest() {
  logger.info("🚀 Starting Smoke Test...");
  
  const results = await Promise.all([
    checkFfmpeg(),
    checkFfprobe(),
    checkAI(),
    checkDirectories(),
    checkDeliveryCapabilities(),
  ]);

  const allPassed = results.every(r => r === true);
  
  if (allPassed) {
    logger.info("✨ SMOKE TEST PASSED!");
    process.exit(0);
  } else {
    logger.error("💥 SMOKE TEST FAILED!");
    process.exit(1);
  }
}

runSmokeTest();
