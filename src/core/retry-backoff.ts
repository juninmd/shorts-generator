import { logger } from "./logger.js";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Return false to skip retry and rethrow immediately. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  logMessage?: string;
}

function isQuotaOrAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("quotaexceeded") || msg.includes("quota") || msg.includes("unauthorized") || msg.includes("403");
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 2000, shouldRetry, logMessage = "Operation failed, retrying..." } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const canRetry = shouldRetry ? shouldRetry(error, attempt) : !isQuotaOrAuthError(error);
      if (!canRetry || attempt === maxAttempts) throw error;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn({ attempt, maxAttempts, delayMs: delay }, logMessage);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
