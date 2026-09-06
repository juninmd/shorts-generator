
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";
import type { WhisperOutput } from "./audio-chunker.js";

const REMOTE_WHISPER_TIMEOUT_MS = Number(process.env.WHISPER_REQUEST_TIMEOUT_MS ?? 600_000);
const REMOTE_WHISPER_RETRIES = Number(process.env.WHISPER_REQUEST_RETRIES ?? 2);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack, cause: error.cause instanceof Error ? { name: error.cause.name, message: error.cause.message } : error.cause };
  }
  return { message: String(error) };
}

export function shouldRetryRemoteWhisper(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError" || error.name === "HeadersTimeoutError" || error.name === "BodyTimeoutError") return true;
  const cause = (error as any).cause;
  if (cause instanceof Error && (cause.name === "HeadersTimeoutError" || cause.name === "BodyTimeoutError")) return true;
  return /fetch failed|ECONNRESET|ECONNREFUSED|UND_ERR|socket|terminated/i.test(error.message);
}


export async function transcribeRemote(audioPath: string, config: PipelineConfig, onProgress?: (pct: number) => void): Promise<WhisperOutput> {
  const url = new URL("/asr", config.whisperBaseUrl);
  url.searchParams.append("task", "transcribe");
  url.searchParams.append("language", "pt");
  url.searchParams.append("output", "json");
  url.searchParams.append("word_timestamps", "True");
  const fileBuffer = fs.readFileSync(audioPath);

  for (let attempt = 1; attempt <= REMOTE_WHISPER_RETRIES + 1; attempt++) {
    try {
      logger.info({ url: url.toString(), attempt, timeoutMs: REMOTE_WHISPER_TIMEOUT_MS, sizeKB: Math.round(fileBuffer.length / 1024) }, "Sending audio to remote Whisper service");
      const boundary = `----FormBoundary${Date.now()}`;
      const filename = path.basename(audioPath);
      const partHeader = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio_file"; filename="${filename}"\r\nContent-Type: audio/wav\r\n\r\n`);
      const partFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
      const bodyBuf = Buffer.concat([partHeader, fileBuffer, partFooter]);

      const raw = await new Promise<any>((resolve, reject) => {
        const parsedUrl = new URL(url.toString());
        const req = http.request({ hostname: parsedUrl.hostname, port: parsedUrl.port || 80, path: parsedUrl.pathname + parsedUrl.search, method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": bodyBuf.length }, timeout: REMOTE_WHISPER_TIMEOUT_MS }, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf-8");
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) reject(new Error(`[WHISPER HTTP ${res.statusCode}] ${text.slice(0, 200)}`));
            else { try { resolve(JSON.parse(text)); } catch { reject(new Error(`Invalid JSON from Whisper: ${text.slice(0, 200)}`)); } }
          });
        });
        req.on("timeout", () => { req.destroy(new Error("WHISPER_TIMEOUT: request exceeded " + Math.round(REMOTE_WHISPER_TIMEOUT_MS / 1000) + "s")); });
        req.on("error", (err) => {
          const msg = String(err?.message ?? err);
          if (msg.includes("ECONNREFUSED")) reject(new Error(`WHISPER_UNREACHABLE: Cannot connect to ${config.whisperBaseUrl} — service not running or wrong address`));
          else if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) reject(new Error(`WHISPER_DNS_ERROR: Cannot resolve hostname in ${config.whisperBaseUrl}`));
          else reject(err);
        });
        req.write(bodyBuf);
        req.end();
      });

      if (raw.language === "portuguese") raw.language = "pt";
      return raw as WhisperOutput;
    } catch (error) {
      const errMsg = String(error instanceof Error ? error.message : error);
      const isUnreachable = errMsg.includes("WHISPER_UNREACHABLE") || errMsg.includes("WHISPER_DNS_ERROR");
      const shouldRetry = attempt <= REMOTE_WHISPER_RETRIES && (shouldRetryRemoteWhisper(error) && !isUnreachable);
      if (shouldRetry) {
        logger.warn({ attempt, error: errorDetails(error), nextRetryIn: 5_000 * attempt }, "Remote Whisper request failed, retrying");
        await sleep(5_000 * attempt);
        continue;
      }
      const finalError = new Error(isUnreachable ? `[WHISPER UNREACHABLE] ${errMsg}\nCheck that WHISPER_BASE_URL="${config.whisperBaseUrl}" is correct and service is running.` : `[WHISPER FAILED after ${attempt} attempt(s)] ${errMsg}`);
      logger.error({ attempt, whisperUrl: config.whisperBaseUrl, error: errorDetails(error), hint: isUnreachable ? "Verify whisper service is running in cluster or locally" : undefined }, finalError.message);
      throw finalError;
    }
  }
  throw new Error("Remote Whisper failed after retries");
}

