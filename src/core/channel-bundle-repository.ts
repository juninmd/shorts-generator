
import type { Pool, PoolClient } from "pg";
import type {
  ChannelFocus,
  FocusKey,
  ChannelProfile,
  ManagedChannel,
  ManagedChannelBundle,
  PublishingAccount,
  SourceTarget,
} from "./channel-domain.js";
import { queryRows, withTransaction } from "./control-plane-db.js";
import { replaceChildren, buildBundle, type ChannelRow, type ProfileRow, type FocusRow, type SourceRow, type AccountRow } from "./channel-bundle-db.js";
export class ChannelBundleRepository {
  constructor(private readonly db: any) {}
  async listBundles(): Promise<readonly ManagedChannelBundle[]> {
    const channels = await queryRows<ChannelRow>(this.db, "SELECT * FROM managed_channels ORDER BY name ASC");
    return this.loadBundles(channels.map((channel) => channel.id), channels);
  }
  async getBundle(channelId: string): Promise<ManagedChannelBundle | null> {
    const channels = await queryRows<ChannelRow>(this.db, "SELECT * FROM managed_channels WHERE id = $1", [channelId]);
    if (channels.length === 0) {
      return null;
    }
    return ((await this.loadBundles([channelId], channels))[0]) ?? null;
  }
  async saveBundle(bundle: ManagedChannelBundle): Promise<void> {
    await withTransaction(this.db, async (client) => {
      await client.query(
        `INSERT INTO managed_channels (id, slug, name, description, status, logo_path, watermark_text, channel_type, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name, description = EXCLUDED.description,
         status = EXCLUDED.status, logo_path = EXCLUDED.logo_path, watermark_text = EXCLUDED.watermark_text, channel_type = EXCLUDED.channel_type, updated_at = EXCLUDED.updated_at`,
        [bundle.channel.id, bundle.channel.slug, bundle.channel.name, bundle.channel.description, bundle.channel.status, bundle.channel.logoPath, bundle.channel.watermarkText, bundle.channel.channelType || "cuts", bundle.channel.createdAt, bundle.channel.updatedAt],
      );
      await client.query(
        `INSERT INTO channel_profiles (channel_id, video_limit, min_short_duration, max_short_duration, target_shorts, video_query, sort_by_views, ai_provider, ai_model)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (channel_id) DO UPDATE SET video_limit = EXCLUDED.video_limit, min_short_duration = EXCLUDED.min_short_duration,
         max_short_duration = EXCLUDED.max_short_duration, target_shorts = EXCLUDED.target_shorts, video_query = EXCLUDED.video_query,
         sort_by_views = EXCLUDED.sort_by_views, ai_provider = EXCLUDED.ai_provider, ai_model = EXCLUDED.ai_model`,
        [bundle.profile.channelId, bundle.profile.videoLimit, bundle.profile.minShortDuration, bundle.profile.maxShortDuration, bundle.profile.targetShorts, bundle.profile.videoQuery, bundle.profile.sortByViews, bundle.profile.aiProvider, bundle.profile.aiModel],
      );
      await replaceChildren(client, "channel_focuses", bundle.channel.id, bundle.focuses, (focus) => [focus.id, bundle.channel.id, focus.key, focus.label]);
      await replaceChildren(client, "source_targets", bundle.channel.id, bundle.sources, (source) => [source.id, bundle.channel.id, source.kind, source.value, source.label, source.createdAt]);
      for (const account of bundle.publishingAccounts) {
        await client.query(
          `INSERT INTO publishing_accounts (id, channel_id, provider, label, status, account_identifier, client_id, client_secret, token_key_version, token_iv, token_auth_tag, token_ciphertext, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (channel_id, provider) DO UPDATE SET
             id = EXCLUDED.id, label = EXCLUDED.label, status = EXCLUDED.status,
             account_identifier = EXCLUDED.account_identifier, client_id = EXCLUDED.client_id,
             client_secret = EXCLUDED.client_secret, token_key_version = EXCLUDED.token_key_version,
             token_iv = EXCLUDED.token_iv, token_auth_tag = EXCLUDED.token_auth_tag,
             token_ciphertext = EXCLUDED.token_ciphertext, updated_at = EXCLUDED.updated_at`,
          [account.id, account.channelId, account.provider, account.label, account.status, account.accountIdentifier, account.clientId, account.clientSecret, account.encryptedToken.keyVersion, account.encryptedToken.iv, account.encryptedToken.authTag, account.encryptedToken.ciphertext, account.createdAt, account.updatedAt],
        );
      }
      const keptProviders = bundle.publishingAccounts.map((a) => a.provider);
      if (keptProviders.length > 0) {
        await client.query(
          `DELETE FROM publishing_accounts WHERE channel_id = $1 AND provider != ALL($2::text[])`,
          [bundle.channel.id, keptProviders],
        );
      } else {
        await client.query("DELETE FROM publishing_accounts WHERE channel_id = $1", [bundle.channel.id]);
      }
    });
  }
  async deleteBundle(channelId: string): Promise<void> {
    await this.db.query("DELETE FROM managed_channels WHERE id = $1", [channelId]);
  }
  async updatePublishingAccount(
    accountId: string,
    updates: { encryptedToken?: { keyVersion: string; iv: string; authTag: string; ciphertext: string }; clientId?: string | null; clientSecret?: string | null; updatedAt: string }
  ): Promise<void> {
    const setParts: string[] = ["updated_at = $2"];
    const params: unknown[] = [accountId, updates.updatedAt];
    let paramIndex = 3;
    if (updates.encryptedToken) {
      setParts.push(`token_key_version = $${paramIndex++}`, `token_iv = $${paramIndex++}`, `token_auth_tag = $${paramIndex++}`, `token_ciphertext = $${paramIndex++}`);
      params.push(updates.encryptedToken.keyVersion, updates.encryptedToken.iv, updates.encryptedToken.authTag, updates.encryptedToken.ciphertext);
    }
    if (updates.clientId !== undefined) {
      setParts.push(`client_id = $${paramIndex++}`);
      params.push(updates.clientId);
    }
    if (updates.clientSecret !== undefined) {
      setParts.push(`client_secret = $${paramIndex++}`);
      params.push(updates.clientSecret);
    }
    await this.db.query(
      `UPDATE publishing_accounts SET ${setParts.join(", ")} WHERE id = $1`,
      params,
    );
  }
  private async loadBundles(
    channelIds: readonly string[],
    channels: readonly ChannelRow[],
  ): Promise<readonly ManagedChannelBundle[]> {
    const profiles = await this.lookupByChannel<ProfileRow>("channel_profiles", channelIds);
    const focuses = await this.lookupByChannel<FocusRow>("channel_focuses", channelIds);
    const sources = await this.lookupByChannel<SourceRow>("source_targets", channelIds);
    const accounts = await this.lookupByChannel<AccountRow>("publishing_accounts", channelIds);
    return channels.map((channel) => buildBundle(channel, profiles, focuses, sources, accounts));
  }
  private async lookupByChannel<Row extends { channel_id: string }>(
    table: string,
    channelIds: readonly string[],
  ): Promise<readonly Row[]> {
    if (channelIds.length === 0) {
      return [];
    }
    return queryRows<Row>(this.db, `SELECT * FROM ${table} WHERE channel_id = ANY($1::text[])`, [channelIds]);
  }
}
