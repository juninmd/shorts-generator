import type { AdminChannelBundle, AdminRunRecord } from "./types";

const API_BASE = "/api/admin";

export async function listChannels(adminToken: string): Promise<AdminChannelBundle[]> {
  return request<AdminChannelBundle[]>(adminToken, "/channels");
}

export async function saveChannel(adminToken: string, channelId: string, payload: Omit<AdminChannelBundle, "channel"> & { channel: AdminChannelBundle["channel"] }): Promise<void> {
  await request(adminToken, `/channels/${channelId}`, {
    method: "PUT",
    body: JSON.stringify({
      slug: payload.channel.slug,
      name: payload.channel.name,
      description: payload.channel.description,
      status: payload.channel.status,
      logoPath: payload.channel.logoPath,
      watermarkText: payload.channel.watermarkText,
      profile: payload.profile,
      focuses: payload.focuses,
      sources: payload.sources,
      publishingAccount: payload.publishingAccount,
    }),
  });
}

export async function deleteChannel(adminToken: string, channelId: string): Promise<void> {
  await request(adminToken, `/channels/${channelId}`, { method: "DELETE" });
}

export async function testChannel(adminToken: string, channelId: string): Promise<void> {
  await request(adminToken, `/channels/${channelId}/test-connection`, { method: "POST" });
}

export async function startManagedRun(adminToken: string, channelId: string): Promise<{ runId: string; status: string }> {
  return request(adminToken, `/channels/${channelId}/runs`, { method: "POST" });
}

export async function listRuns(adminToken: string, channelId?: string, offset = 0, limit = 20): Promise<AdminRunRecord[]> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (channelId) query.set("channelId", channelId);
  const suffix = `/runs?${query.toString()}`;
  return request<AdminRunRecord[]>(adminToken, suffix);
}

export async function startGeneration(_urls: string[]): Promise<{ jobId: string }> {
  throw new Error("Legacy generation flow was replaced by managed channel runs.");
}

export async function getJobStatus(_jobId: string): Promise<never> {
  throw new Error("Legacy generation flow was replaced by managed channel runs.");
}

export async function getShorts(): Promise<never[]> {
  return [];
}

export function getDownloadUrl(videoId: string, clipId: string): string {
  return `/api/shorts/${videoId}/${clipId}`;
}

async function request<T>(adminToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Request failed: ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
