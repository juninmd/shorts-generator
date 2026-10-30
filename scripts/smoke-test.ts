import { loadConfig } from "../src/core/config.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "../src/core/logger.js";
import { createModel } from "../src/core/ai-provider.js";
import { hasTonemapFilters } from "../src/core/hdr-tonemap.js";
import { ffmpegBin, ffprobeBin } from "../src/core/ffmpeg-bin.js";
import { buildAudioEncoderArgs, buildVideoEncoderArgs } from "../src/core/encode-settings.js";
import { DELIVERY_SPECS } from "../src/core/delivery-spec.js";
import { probeRenderedShort, validateShortMetadata } from "../src/core/short-quality.js";

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

/**
 * Encode one second with the real delivery flag set and probe the result: a typo'd or
 * unsupported option (private x264 flag, wrong pixel format) ships green otherwise.
 */
async function checkDeliveryEncode() {
  const spec = DELIVERY_SPECS.shorts!;
  // A private directory: a predictable name in a shared /tmp could be pre-planted as a symlink.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shorts-smoke-"));
  const output = path.join(dir, "delivery.mp4");
  try {
    await execFileAsync(ffmpegBin(), [
      "-hide_banner", "-nostdin", "-y",
      "-f", "lavfi", "-i", `testsrc2=s=${spec.width}x${spec.height}:r=${spec.fps}:d=1`,
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      ...buildVideoEncoderArgs({ encoder: "libx264", spec, quality: 28, preset: "veryfast" }),
      ...buildAudioEncoderArgs(spec),
      "-movflags", "+faststart", "-t", "1", output,
    ], { timeout: 120_000 });
    const metadata = await probeRenderedShort(output);
    validateShortMetadata(metadata, { duration: 1, width: spec.width, height: spec.height }, spec);
    logger.info(`✅ Delivery encode accepted the flag set (${spec.width}x${spec.height}, AAC ${spec.sampleRate} Hz stereo)`);
    return true;
  } catch (err: any) {
    logger.error("❌ Delivery encode failed: " + err.message);
    return false;
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // A diagnostic must report its result, not fail on cleanup.
    }
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
    checkDeliveryEncode(),
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
