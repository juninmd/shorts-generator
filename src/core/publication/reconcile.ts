import { google } from "googleapis";
import type { PipelineConfig } from "../../types.js";
import { getYouTubeAuth } from "../youtube-auth.service.js";
import { reconciliationTag } from "./youtube-publisher.js";

export interface RecentUpload {
  readonly videoId: string;
  readonly tags: readonly string[];
}

export type ReconcileResult =
  | { readonly status: "found"; readonly videoId: string }
  | { readonly status: "not_found" }
  | { readonly status: "unknown"; readonly error: string };

export type UploadLister = (config: PipelineConfig) => Promise<RecentUpload[]>;

/**
 * Lists the channel's last 50 uploads with tags (2 quota units).
 * Requires the youtube.readonly scope in addition to youtube.upload.
 */
export const listRecentUploads: UploadLister = async (config) => {
  const auth = await getYouTubeAuth(config);
  if (!auth) throw new Error("YouTube credentials not configured");
  const client = new google.auth.OAuth2(auth.clientId, auth.clientSecret);
  client.setCredentials({ refresh_token: auth.refreshToken });
  const youtube = google.youtube({ version: "v3", auth: client });
  const channels = await youtube.channels.list({ part: ["contentDetails"], mine: true });
  const playlistId = channels.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) return [];
  const items = await youtube.playlistItems.list({ part: ["contentDetails"], playlistId, maxResults: 50 });
  const ids = (items.data.items ?? []).map((i) => i.contentDetails?.videoId).filter((id): id is string => !!id);
  if (ids.length === 0) return [];
  const videos = await youtube.videos.list({ part: ["snippet"], id: ids });
  return (videos.data.items ?? []).map((v) => ({ videoId: v.id ?? "", tags: v.snippet?.tags ?? [] }));
};

/** Looks for the upload by its reconciliation tag; permission/network errors keep the state unknown. */
export async function findUploadedPublication(
  publicationId: string,
  config: PipelineConfig,
  lister: UploadLister = listRecentUploads,
): Promise<ReconcileResult> {
  try {
    const tag = reconciliationTag(publicationId);
    const match = (await lister(config)).find((u) => u.tags.includes(tag));
    return match ? { status: "found", videoId: match.videoId } : { status: "not_found" };
  } catch (error) {
    return { status: "unknown", error: error instanceof Error ? error.message : String(error) };
  }
}
