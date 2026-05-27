/* v8 ignore start */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { Transcript, TranscriptSegment, TranscriptWord, DownloadedVideo, PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import {
  getAudioChunkDurationSec,
  splitAudioIntoChunks,
  mergeWhisperOutputs,
  cleanupChunkFiles,
  type WhisperOutput,
} from "./audio-chunker.js";

const REMOTE_WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_REQUEST_TIMEOUT_MS ?? 600_000);
const REMOTE_WHISPER_RETRIES = Number(process.env.WHISPER_REQUEST_RETRIES ?? 2);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error ? { name: error.cause.name, message: error.cause.message } : error.cause,
    };
  }
  return { message: String(error) };
}

function shouldRetryRemoteWhisper(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError" || error.name === "HeadersTimeoutError" || error.name === "BodyTimeoutError") return true;
  const cause = (error as any).cause;
  if (cause instanceof Error && (cause.name === "HeadersTimeoutError" || cause.name === "BodyTimeoutError")) return true;
  return /fetch failed|ECONNRESET|ECONNREFUSED|UND_ERR|socket|terminated/i.test(error.message);
}

async function transcribeRemote(
  audioPath: string,
  config: PipelineConfig,
  onProgress?: (pct: number) => void,
): Promise<WhisperOutput> {
  const url = new URL("/asr", config.whisperBaseUrl);
  url.searchParams.append("task", "transcribe");
  url.searchParams.append("language", "pt");
  url.searchParams.append("output", "json");
  url.searchParams.append("word_timestamps", "True");

  const fileBuffer = fs.readFileSync(audioPath);

  for (let attempt = 1; attempt <= REMOTE_WHISPER_RETRIES + 1; attempt++) {
    try {
      logger.info(
        { url: url.toString(), attempt, timeoutMs: REMOTE_WHISPER_TIMEOUT_MS, sizeKB: Math.round(fileBuffer.length / 1024) },
        "Sending audio to remote Whisper service",
      );

      const boundary = `----FormBoundary${Date.now()}`;
      const filename = path.basename(audioPath);
      const partHeader = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="audio_file"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`,
      );
      const partFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
      const bodyBuf = Buffer.concat([partHeader, fileBuffer, partFooter]);

      const raw = await new Promise<any>((resolve, reject) => {
        const parsedUrl = new URL(url.toString());
        const req = http.request(
          {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname + parsedUrl.search,
            method: "POST",
            headers: {
              "Content-Type": `multipart/form-data; boundary=${boundary}`,
              "Content-Length": bodyBuf.length,
            },
            timeout: REMOTE_WHISPER_TIMEOUT_MS,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              const text = Buffer.concat(chunks).toString("utf-8");
              if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error(`Remote Whisper failed (${res.statusCode}): ${text}`));
              } else {
                try { resolve(JSON.parse(text)); } catch { reject(new Error(`Invalid JSON from Whisper: ${text.slice(0, 200)}`)); }
              }
            });
          },
        );
        req.on("timeout", () => { req.destroy(new Error("HeadersTimeoutError: request timed out")); });
        req.on("error", reject);
        req.write(bodyBuf);
        req.end();
      });

      // Normalize language name (OpenAI Whisper often returns full name like 'portuguese')
      if (raw.language === "portuguese") raw.language = "pt";

      return raw as WhisperOutput;
    } catch (error) {
      if (attempt <= REMOTE_WHISPER_RETRIES && shouldRetryRemoteWhisper(error)) {
        logger.warn({ attempt, error: errorDetails(error) }, "Remote Whisper request failed, retrying");
        await sleep(5_000 * attempt);
        continue;
      }
      logger.error({ attempt, error: errorDetails(error) }, "Remote Whisper request failed");
      throw error;
    }
  }

  throw new Error("Remote Whisper failed after retries");
}

 /* v8 ignore start */
export async function transcribeVideo(video: DownloadedVideo, config: PipelineConfig): Promise<Transcript> {
  if (!config.whisperBaseUrl) throw new Error("WHISPER_BASE_URL is required; cluster faster-whisper is the only supported transcriber");

  logger.info({ videoId: video.id, title: video.title, baseUrl: config.whisperBaseUrl }, "Starting faster-whisper transcription");

  const outputDir = path.join(config.tempDir, video.id, "whisper_out");
  fs.mkdirSync(outputDir, { recursive: true });
  const onProgress = (config as any).onProgress as ((pct: number) => void) | undefined;

  let raw: WhisperOutput;

  const chunkDurationSec = getAudioChunkDurationSec();

  if (video.duration > chunkDurationSec) {
    const chunkCount = Math.ceil(video.duration / chunkDurationSec);
    logger.info({ videoId: video.id, durationSec: video.duration, chunkDurationSec, chunkCount }, "Audio too long — splitting into chunks");
    const chunks = await splitAudioIntoChunks(video.audioPath, video.duration, chunkDurationSec, outputDir);
    const chunkOutputs: { data: WhisperOutput; offsetSec: number }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const { path: chunkPath, offsetSec } = chunks[i]!;
      logger.info({ videoId: video.id, chunk: i + 1, of: chunks.length, offsetSec }, "Transcribing audio chunk");
      const chunkOnProgress = onProgress
        ? (pct: number) => onProgress(((i + pct / 100) / chunks.length) * 100)
        : undefined;
      
      const data = await transcribeRemote(chunkPath, config, chunkOnProgress);
      chunkOutputs.push({ data, offsetSec });
    }
    cleanupChunkFiles(chunks);
    raw = mergeWhisperOutputs(chunkOutputs);
  } else {
    raw = await transcribeRemote(video.audioPath, config, onProgress);
  }

  fs.rmSync(outputDir, { recursive: true, force: true });

  const allSegments: TranscriptSegment[] = [];
  const allWords: TranscriptWord[] = [];

  for (const seg of raw.segments ?? []) {
    allSegments.push({ start: seg.start ?? 0, end: seg.end ?? 0, text: (seg.text ?? "").trim() });
    for (const w of (seg as any).words ?? []) {
      allWords.push({ word: (w.word ?? "").trim(), start: w.start ?? 0, end: w.end ?? 0 });
    }
  }

  allSegments.sort((a, b) => a.start - b.start);
  allWords.sort((a, b) => a.start - b.start);

  logger.info(
    { videoId: video.id, segmentCount: allSegments.length, wordCount: allWords.length, language: raw.language },
    "Faster-whisper transcription complete",
  );

  return {
    videoId: video.id,
    segments: allSegments,
    words: allWords,
    fullText: allSegments.map((s) => s.text).join(" "),
    language: raw.language ?? "pt",
    duration: video.duration,
  };
}
/* v8 ignore stop */
