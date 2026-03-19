import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { getVideoInfo, downloadVideo, cleanupVideo } from "../../src/core/youtube.js";
import { loadConfig } from "../../src/core/config.js";
import fs from "node:fs";
import { execFile } from "node:child_process";

// Make sure vi.mock isn't hoisting over this file.
// We explicitly tell vitest NOT to mock these for THIS file
vi.unmock("node:child_process");
vi.unmock("node:fs");
vi.unmock("../../src/core/youtube.js");

describe("E2E: YouTube Download", () => {
  // Use real config but ensure temp dir exists
  const config = loadConfig();

  beforeAll(async () => {
    // Unmock execFile and fs for this specific E2E test
    vi.unmock("node:child_process");
    vi.unmock("node:fs");
    vi.unmock("node:path");
    vi.unmock("../../src/core/youtube.js");

    const originalExec = (await import("node:child_process")).execFile;
    // This file doesn't mock youtube, it relies on the real implementation
    // But other tests might have mocked it if they run in same context.

    if (!fs.existsSync(config.tempDir)) {
      fs.mkdirSync(config.tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    // We try to clean up the specific video folder
    try {
      cleanupVideo("dQw4w9WgXcQ", config);
    } catch {
      // Ignore cleanup errors
    }
  });

  // Skip this test in normal fast local runs unless specifically requested or running in CI Action
  const runE2E = process.env.GITHUB_ACTIONS === "true" || process.env.RUN_E2E === "true";

  (runE2E ? it : it.skip)("should fetch video info and download successfully", async () => {
    // A very short, known video to prevent long downloads during tests
    // This validates the actual yt-dlp connection to YouTube
    // Using a less restrictive video than "Me at the zoo" to avoid 403 Forbidden issues
    const TEST_VIDEO_ID = "dQw4w9WgXcQ"; // Rick Astley - Never Gonna Give You Up (short enough format available)
    const TEST_VIDEO_URL = `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`;

    // 1. Get Info
    const info = await getVideoInfo(TEST_VIDEO_URL);
    expect(info).toBeDefined();
    expect(info?.id).toBe(TEST_VIDEO_ID);
    expect(info?.duration).toBeGreaterThan(0);
    expect(info?.title).toBeDefined();

    if (!info) throw new Error("Could not get info");

    // 2. Download
    const downloaded = await downloadVideo(info, config);

    // Verify file properties
    expect(downloaded.filePath).toBeDefined();
    expect(downloaded.audioPath).toBeDefined();
    expect(downloaded.fileSize).toBeGreaterThan(0);

    // Verify files actually exist on disk
    expect(fs.existsSync(downloaded.filePath)).toBe(true);
    expect(fs.existsSync(downloaded.audioPath)).toBe(true);

    const statVideo = fs.statSync(downloaded.filePath);
    expect(statVideo.size).toBe(downloaded.fileSize);

    const statAudio = fs.statSync(downloaded.audioPath);
    expect(statAudio.size).toBeGreaterThan(0);
  }, 120_000); // 2 minutes timeout for downloading
});
