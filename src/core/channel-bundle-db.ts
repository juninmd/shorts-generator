import type { PoolClient } from "pg";
import type {
  ChannelFocus,
  FocusKey,
  ChannelProfile,
  ManagedChannel,
  ManagedChannelBundle,
  PublishingAccount,
  SourceTarget,
} from "./channel-domain.js";

export type ChannelRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: ManagedChannel["status"];
  logo_path: string | null;
  watermark_text: string;
  channel_type: ManagedChannel["channelType"];
  created_at: string;
  updated_at: string;
};
export type ProfileRow = {
  channel_id: string;
  video_limit: number;
  min_short_duration: number;
  max_short_duration: number;
  target_shorts: number | null;
  video_query: string | null;
  sort_by_views: boolean;
  ai_provider: ChannelProfile["aiProvider"];
  ai_model: string;
};
export type FocusRow = ChannelFocus & { channel_id: string };
export type SourceRow = SourceTarget & { channel_id: string };
export type AccountRow = {
  id: string;
  channel_id: string;
  provider: PublishingAccount["provider"];
  label: string;
  status: PublishingAccount["status"];
  account_identifier: string;
  client_id: string | null;
  client_secret: string | null;
  created_at: string;
  updated_at: string;
  token_key_version: string;
  token_iv: string;
  token_auth_tag: string;
  token_ciphertext: string;
};

export async function replaceChildren<T>(
  client: PoolClient,
  table: "channel_focuses" | "source_targets",
  channelId: string,
  values: readonly T[],
  map: (value: T) => unknown[],
): Promise<void> {
  await client.query(`DELETE FROM ${table} WHERE channel_id = $1`, [channelId]);
  for (const value of values) {
    const params = map(value);
    if (table === "channel_focuses") {
      await client.query("INSERT INTO channel_focuses (id, channel_id, focus_key, focus_label) VALUES ($1,$2,$3,$4)", params);
      continue;
    }
    await client.query("INSERT INTO source_targets (id, channel_id, kind, value, label, created_at) VALUES ($1,$2,$3,$4,$5,$6)", params);
  }
}
export function buildBundle(
  channel: ChannelRow,
  profiles: readonly ProfileRow[],
  focuses: readonly FocusRow[],
  sources: readonly SourceRow[],
  accounts: readonly AccountRow[],
): ManagedChannelBundle {
  const profile = profiles.find((entry) => entry.channel_id === channel.id);
  if (!profile) {
    throw new Error(`Missing profile for channel ${channel.id}`);
  }
  const channelAccounts = accounts.filter((entry) => entry.channel_id === channel.id);
  return {
    channel: {
      id: channel.id,
      slug: channel.slug,
      name: channel.name,
      description: channel.description,
      status: channel.status,
      logoPath: channel.logo_path,
      watermarkText: channel.watermark_text,
      channelType: channel.channel_type || "cuts",
      createdAt: channel.created_at,
      updatedAt: channel.updated_at,
    },
    profile: {
      channelId: profile.channel_id,
      videoLimit: profile.video_limit,
      minShortDuration: profile.min_short_duration,
      maxShortDuration: profile.max_short_duration,
      targetShorts: profile.target_shorts,
      videoQuery: profile.video_query,
      sortByViews: profile.sort_by_views,
      aiProvider: profile.ai_provider,
      aiModel: profile.ai_model,
    },
    focuses: focuses.filter((entry) => entry.channel_id === channel.id).map(({ channel_id: _ignore, ...focus }) => ({
      ...focus,
      key: focus.key ?? (focus as { focus_key?: FocusKey }).focus_key,
      label: focus.label ?? (focus as { focus_label?: string }).focus_label,
    })),
    sources: sources.filter((entry) => entry.channel_id === channel.id).map(({ channel_id: _ignore, ...source }) => ({
      ...source,
      createdAt: source.createdAt ?? (source as { created_at?: string }).created_at,
    })),
    publishingAccounts: channelAccounts.map((account) => ({
      id: account.id,
      channelId: account.channel_id,
      provider: account.provider,
      label: account.label,
      status: account.status,
      accountIdentifier: account.account_identifier,
      clientId: account.client_id,
      clientSecret: account.client_secret,
      encryptedToken: {
        keyVersion: account.token_key_version,
        iv: account.token_iv,
        authTag: account.token_auth_tag,
        ciphertext: account.token_ciphertext,
      },
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    })),
  };
}
