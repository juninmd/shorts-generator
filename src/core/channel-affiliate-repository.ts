import { queryRows } from "./control-plane-db.js";
import type { AffiliateLink } from "./affiliate-links.js";

export interface ChannelAffiliateLink extends AffiliateLink {
  readonly id: string;
  readonly channelId: string;
  readonly active: boolean;
  readonly position: number;
  readonly createdAt: string;
}

/** Link do pool global: não pertence a um canal e vale para todos. */
export interface GlobalAffiliateLink extends AffiliateLink {
  readonly id: string;
  readonly active: boolean;
  readonly position: number;
  readonly createdAt: string;
}

interface Row {
  id: string;
  channel_id: string;
  name: string;
  url: string;
  active: boolean;
  position: number;
  created_at: string;
}

interface GlobalRow {
  id: string;
  name: string;
  url: string;
  active: boolean;
  position: number;
  created_at: string;
}

const toLink = (r: Row): ChannelAffiliateLink => ({
  id: r.id,
  channelId: r.channel_id,
  name: r.name,
  url: r.url,
  active: r.active,
  position: r.position,
  createdAt: r.created_at,
});

const toGlobalLink = (r: GlobalRow): GlobalAffiliateLink => ({
  id: r.id,
  name: r.name,
  url: r.url,
  active: r.active,
  position: r.position,
  createdAt: r.created_at,
});

export class ChannelAffiliateRepository {
  constructor(private readonly db: any) {}

  async listLinks(channelId: string): Promise<readonly ChannelAffiliateLink[]> {
    const rows = await queryRows<Row>(
      this.db,
      "SELECT * FROM channel_affiliate_links WHERE channel_id = $1 ORDER BY position ASC, created_at ASC",
      [channelId],
    );
    return rows.map(toLink);
  }

  async listGlobalLinks(): Promise<readonly GlobalAffiliateLink[]> {
    const rows = await queryRows<GlobalRow>(
      this.db,
      "SELECT * FROM affiliate_links ORDER BY position ASC, created_at ASC",
    );
    return rows.map(toGlobalLink);
  }

  /**
   * Links usados no comentário fixo e na descrição: os do canal primeiro
   * (curadoria do canal tem prioridade) e depois o pool global, sem repetir URL.
   */
  async listActive(channelId: string): Promise<readonly AffiliateLink[]> {
    const [channelLinks, globalLinks] = await Promise.all([
      this.listLinks(channelId),
      this.listGlobalLinks(),
    ]);
    const seen = new Set<string>();
    const merged: AffiliateLink[] = [];
    for (const link of [...channelLinks, ...globalLinks]) {
      if (!link.active || seen.has(link.url)) continue;
      seen.add(link.url);
      merged.push({ name: link.name, url: link.url });
    }
    return merged;
  }

  async addLink(link: ChannelAffiliateLink): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO channel_affiliate_links (id, channel_id, name, url, active, position, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (channel_id, url) DO NOTHING`,
      [link.id, link.channelId, link.name, link.url, link.active, link.position, link.createdAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async addGlobalLink(link: GlobalAffiliateLink): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO affiliate_links (id, name, url, active, position, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (url) DO NOTHING`,
      [link.id, link.name, link.url, link.active, link.position, link.createdAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setActive(channelId: string, linkId: string, active: boolean): Promise<boolean> {
    const result = await this.db.query(
      "UPDATE channel_affiliate_links SET active = $3 WHERE channel_id = $1 AND id = $2",
      [channelId, linkId, active],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setGlobalActive(linkId: string, active: boolean): Promise<boolean> {
    const result = await this.db.query(
      "UPDATE affiliate_links SET active = $2 WHERE id = $1",
      [linkId, active],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteLink(channelId: string, linkId: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM channel_affiliate_links WHERE channel_id = $1 AND id = $2",
      [channelId, linkId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteGlobalLink(linkId: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM affiliate_links WHERE id = $1",
      [linkId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
