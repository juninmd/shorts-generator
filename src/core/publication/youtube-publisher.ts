import fs from "node:fs";
import { google } from "googleapis";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";
import { getYouTubeAuth, validateYouTubeToken } from "../youtube-auth.service.js";
import { isDailyLimitReachedAsync, setDailyLimitReachedAsync } from "../state.js";

export type UploadOutcome =
  | { readonly kind: "published"; readonly videoId: string; readonly url: string }
  | { readonly kind: "not_sent"; readonly error: string; readonly retryable: boolean }
  | { readonly kind: "uncertain"; readonly error: string };

export interface UploadRequest {
  readonly videoPath: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly privacyStatus?: "public" | "private" | "unlisted";
}

/** Tag used to find an upload again when its outcome is unknown. */
export const reconciliationTag = (publicationId: string) => `sgpub${publicationId.replace(/-/g, "").slice(0, 12)}`;

export type VideoInserter = (request: UploadRequest, config: PipelineConfig) => Promise<{ id?: string | null }>;

const defaultInserter: VideoInserter = async (request, config) => {
  const auth = await getYouTubeAuth(config);
  if (!auth) throw Object.assign(new Error("YouTube credentials not configured"), { preflight: true });
  const client = new google.auth.OAuth2(auth.clientId, auth.clientSecret);
  client.setCredentials({ refresh_token: auth.refreshToken });
  const res = await google.youtube({ version: "v3", auth: client }).videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title: request.title.slice(0, 100), description: request.description, tags: [...request.tags], categoryId: "22" },
      status: { privacyStatus: request.privacyStatus ?? "public", selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(request.videoPath) },
  });
  return { id: res.data?.id };
};

/**
 * Classifies an insert failure: an HTTP 4xx answer means YouTube rejected the
 * request (nothing created); network errors, timeouts and 5xx are uncertain.
 */
export function classifyUploadError(error: unknown): Exclude<UploadOutcome, { kind: "published" }> {
  const e = error as { code?: unknown; status?: unknown; response?: { status?: number }; message?: string; preflight?: boolean };
  const message = String(e?.message ?? error);
  if (e?.preflight) return { kind: "not_sent", error: message, retryable: false };
  const status = Number(e?.response?.status ?? e?.status ?? (typeof e?.code === "number" ? e.code : NaN));
  if (status >= 400 && status < 500) {
    return { kind: "not_sent", error: message, retryable: status === 429 || /exceeded the number of videos|uploadLimitExceeded/i.test(message) };
  }
  return { kind: "uncertain", error: message };
}

export async function uploadWithOutcome(
  request: UploadRequest,
  config: PipelineConfig,
  insert: VideoInserter = defaultInserter,
): Promise<UploadOutcome> {
  if (process.env.ENABLE_YOUTUBE !== "true") return { kind: "not_sent", error: "ENABLE_YOUTUBE is not true", retryable: false };
  if (!fs.existsSync(request.videoPath)) return { kind: "not_sent", error: `artifact missing: ${request.videoPath}`, retryable: false };
  const channelId = config.managedRun?.channelId || "global";
  if (await isDailyLimitReachedAsync(config.dailyUploadLimit, channelId)) {
    return { kind: "not_sent", error: "daily upload limit reached", retryable: true };
  }
  if (insert === defaultInserter) {
    const validation = await validateYouTubeToken(config);
    if (!validation.valid) return { kind: "not_sent", error: `invalid token: ${validation.error ?? "unknown"}`, retryable: false };
  }
  try {
    // Single attempt: retrying an insert whose result is unknown could publish twice.
    const { id } = await insert(request, config);
    if (!id) return { kind: "uncertain", error: "insert returned no video id" };
    return { kind: "published", videoId: id, url: `https://youtube.com/shorts/${id}` };
  } catch (error) {
    const outcome = classifyUploadError(error);
    if (outcome.kind === "not_sent" && outcome.retryable && /exceeded the number of videos|uploadLimitExceeded/i.test(outcome.error)) {
      await setDailyLimitReachedAsync(channelId);
    }
    logger.warn({ channelId, outcome: outcome.kind, error: outcome.error }, "YouTube insert failed");
    return outcome;
  }
}
