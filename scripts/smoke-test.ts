import { loadConfig } from "../src/core/config.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../src/core/logger.js";
import { createModel } from "../src/core/ai-provider.js";

const execFileAsync = promisify(execFile);

async function checkFfmpeg() {
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"]);
    logger.info("✅ FFmpeg found: " + stdout.split("\n")[0]);
    return true;
  } catch (err) {
    logger.error("❌ FFmpeg NOT found in PATH");
    return false;
  }
}

async function checkFfprobe() {
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-version"]);
    logger.info("✅ FFprobe found: " + stdout.split("\n")[0]);
    return true;
  } catch (err) {
    logger.error("❌ FFprobe NOT found in PATH");
    return false;
  }
}

async function checkAI() {
  const config = loadConfig();
  logger.info(`Checking AI Provider: ${config.aiProvider} (${config.aiModel})`);
  
  if (config.aiProvider === "openrouter") {
    if (!config.openrouterApiKey) {
      logger.error("❌ OPENROUTER_API_KEY is missing");
      return false;
    }
    logger.info("✅ OpenRouter API Key is set");
  } else if (config.aiProvider === "ollama") {
    logger.info(`✅ Ollama base URL: ${config.ollamaBaseUrl}`);
  }

  try {
    const model = createModel(config);
    logger.info("✅ AI Model object created successfully");
  } catch (err: any) {
    logger.error("❌ Failed to create AI Model: " + err.message);
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

async function runSmokeTest() {
  logger.info("🚀 Starting Smoke Test...");
  
  const results = await Promise.all([
    checkFfmpeg(),
    checkFfprobe(),
    checkAI(),
    checkDirectories(),
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
