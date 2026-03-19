import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  Transcript,
  TranscriptSegment,
  TranscriptWord,
  DownloadedVideo,
  PipelineConfig,
} from "../types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

/**
 * Locate a uv binary that supports the `run` subcommand (>= 0.2.0).
 * Checks the system PATH first, then common install locations used by the
 * official uv installer on both Linux and Windows.
 */
async function findUvBinary(): Promise<string> {
  const isWindows = process.platform === "win32";
  const home = os.homedir();

  // Candidates: system PATH first, then known installer locations
  const candidates = [
    "uv",
    path.join(home, ".local", "bin", isWindows ? "uv.exe" : "uv"),
    path.join(home, ".cargo", "bin", isWindows ? "uv.exe" : "uv"),
    path.join(home, "bin", isWindows ? "uv.exe" : "uv"),
    // winget / scoop / manual installs on Windows
    ...(isWindows
      ? [
          path.join(home, ".local", "bin", "uv.exe"),
          path.join(process.env.LOCALAPPDATA ?? "", "uv", "bin", "uv.exe"),
        ]
      : []),
  ];

  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ["--version"], {
        timeout: 5_000,
      });
      const match = stdout.trim().match(/uv (\d+)\.(\d+)/);
      if (match) {
        const [, majorStr, minorStr] = match;
        const major = parseInt(majorStr!, 10);
        const minor = parseInt(minorStr!, 10);
        // uv run was introduced in 0.2.0
        if (major > 0 || minor >= 2) {
          logger.debug({ binary: candidate, version: stdout.trim() }, "Using uv binary");
          return candidate;
        }
      }
    } catch {
      /* not found or too old — try next */
    }
  }

  throw new Error(
    "No compatible uv installation found (requires uv >= 0.2.0). " +
      "Install from https://docs.astral.sh/uv/getting-started/installation/",
  );
}

/**
 * Transcribe a video using local openai-whisper CLI with word-level timestamps.
 * Completely free — no API calls, runs entirely on CPU/GPU locally.
 *
 * Requires: pip install openai-whisper
 */
export async function transcribeVideo(
  video: DownloadedVideo,
  config: PipelineConfig,
): Promise<Transcript> {
  logger.info(
    { videoId: video.id, title: video.title, model: config.whisperModel },
    "Starting local Whisper transcription",
  );

  const outputDir = path.join(config.tempDir, video.id, "whisper_out");
  fs.mkdirSync(outputDir, { recursive: true });

  // Run local faster-whisper script — outputs JSON with word-level timestamps
  const scriptPath = path.join(process.cwd(), "scripts", "transcribe_faster.py");
  const pyProjectDir = path.join(process.cwd(), "tests", "yt-download");

  const uvBin = await findUvBinary();

  const runTranscription = async (useGpu: boolean) => {
    const env = {
      ...process.env,
      WHISPER_USE_GPU: useGpu ? "true" : "false",
    };

    await execFileAsync(
      uvBin,
      [
        "run",
        "--project",
        pyProjectDir,
        "python",
        scriptPath,
        video.audioPath,
        "--model",
        config.whisperModel,
        "--output_dir",
        outputDir,
      ],
      {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 600_000,
        env,
      },
    );
  };

  try {
    const initialGpuSetting = process.env.WHISPER_USE_GPU?.toLowerCase() === "true";
    await runTranscription(initialGpuSetting);
  } catch (error: any) {
    if (process.env.WHISPER_USE_GPU?.toLowerCase() === "true") {
      logger.warn(
        { videoId: video.id, error: error.message },
        "Whisper GPU transcription failed (possibly missing DLLs). Retrying with CPU...",
      );
      await runTranscription(false);
    } else {
      throw error;
    }
  }

  // Find the generated JSON file
  const audioBaseName = path.basename(video.audioPath, path.extname(video.audioPath));
  const jsonPath = path.join(outputDir, `${audioBaseName}.json`);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Whisper output not found at ${jsonPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  const allSegments: TranscriptSegment[] = [];
  const allWords: TranscriptWord[] = [];
  let detectedLanguage = raw.language ?? "pt";

  for (const seg of raw.segments ?? []) {
    allSegments.push({
      start: seg.start ?? 0,
      end: seg.end ?? 0,
      text: (seg.text ?? "").trim(),
    });

    // Extract word-level timestamps from segment
    for (const w of seg.words ?? []) {
      allWords.push({
        word: (w.word ?? "").trim(),
        start: w.start ?? 0,
        end: w.end ?? 0,
      });
    }
  }

  // Sort by start time
  allSegments.sort((a, b) => a.start - b.start);
  allWords.sort((a, b) => a.start - b.start);

  const transcript: Transcript = {
    videoId: video.id,
    segments: allSegments,
    words: allWords,
    fullText: allSegments.map((s) => s.text).join(" "),
    language: detectedLanguage,
    duration: video.duration,
  };

  // Cleanup whisper output
  fs.rmSync(outputDir, { recursive: true, force: true });

  logger.info(
    {
      videoId: video.id,
      segmentCount: allSegments.length,
      wordCount: allWords.length,
      language: detectedLanguage,
    },
    "Local Whisper transcription complete",
  );

  return transcript;
}
