import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChannelBundleRepository } from "../../src/core/channel-bundle-repository.js";
import { withTransaction, queryRows } from "../../src/core/control-plane-db.js";

vi.mock("../../src/core/control-plane-db.js", () => ({
  withTransaction: vi.fn(async (pool, cb) => cb(pool)),
  queryRows: vi.fn(),
}));

function makePool(queries: Record<string, unknown[]>) {
  return {
    query: vi.fn(async (sql: string) => {
      const matchedKey = Object.keys(queries).find((k) => sql.includes(k));
      return { rows: matchedKey ? queries[matchedKey] : [] };
    }),
  };
}

describe("ChannelBundleRepository", () => {
  const dummyChannel = { id: "ch-1", name: "Channel", channel_type: "cuts", created_at: "2024", updated_at: "2024" };
  const dummyProfile = { channel_id: "ch-1", video_limit: 3 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listBundles loads and builds bundles correctly", async () => {
    const pool = makePool({});
    vi.mocked(queryRows).mockImplementation(async (_pool, sql) => {
      if (sql.includes("managed_channels")) return [dummyChannel];
      if (sql.includes("channel_profiles")) return [dummyProfile];
      if (sql.includes("source_targets")) return [{id: "1", channel_id: "ch-1"}];
      if (sql.includes("channel_focuses")) return [{id: "1", channel_id: "ch-1"}];
      if (sql.includes("publishing_accounts")) return [{id: "1", channel_id: "ch-1"}];
      return [];
    });

    const repo = new ChannelBundleRepository(pool as any);
    const bundles = await repo.listBundles();
    expect(bundles).toHaveLength(1);
    expect(bundles[0].channel.id).toBe("ch-1");
    expect(bundles[0].channel.channelType).toBe("cuts");
    expect(bundles[0].sources).toHaveLength(1);
    expect(bundles[0].focuses).toHaveLength(1);
    expect(bundles[0].publishingAccounts).toHaveLength(1);
  });

  it("getBundle returns null if not found", async () => {
    const pool = makePool({});
    vi.mocked(queryRows).mockImplementation(async () => []);

    const repo = new ChannelBundleRepository(pool as any);
    const bundle = await repo.getBundle("missing");
    expect(bundle).toBeNull();
  });

  it("getBundle throws if profile is missing", async () => {
    const pool = makePool({});
    vi.mocked(queryRows).mockImplementation(async (_pool, sql) => {
      if (sql.includes("managed_channels")) return [dummyChannel];
      return []; // no profiles
    });

    const repo = new ChannelBundleRepository(pool as any);
    await expect(repo.getBundle("ch-1")).rejects.toThrow(/Missing profile/);
  });

  it("saveBundle inserts/updates data correctly", async () => {
    const pool = makePool({});
    const repo = new ChannelBundleRepository(pool as any);

    const bundle = {
      channel: { id: "ch-1", slug: "ch-1", name: "Chan", description: "", status: "active", logoPath: null, watermarkText: "", channelType: "cuts", createdAt: "now", updatedAt: "now" },
      profile: { channelId: "ch-1", videoLimit: 1, minShortDuration: 10, maxShortDuration: 60, targetShorts: null, videoQuery: null, sortByViews: false, aiProvider: "ollama", aiModel: "m1" },
      focuses: [{ id: "f1", key: "k", label: "L" }],
      sources: [{ id: "s1", kind: "youtube_channel", value: "v", label: "L", createdAt: "now" }],
      publishingAccounts: [
        { id: "acc-1", channelId: "ch-1", provider: "youtube", label: "L", status: "active", accountIdentifier: "a", clientId: null, clientSecret: null, encryptedToken: { keyVersion: "1", iv: "i", authTag: "t", ciphertext: "c" }, createdAt: "now", updatedAt: "now" }
      ]
    };

    await repo.saveBundle(bundle as any);

    expect(withTransaction).toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO managed_channels"), expect.any(Array));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO channel_profiles"), expect.any(Array));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO channel_focuses"), expect.any(Array));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO source_targets"), expect.any(Array));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO publishing_accounts"), expect.any(Array));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM publishing_accounts WHERE channel_id = $1 AND provider != ALL"), expect.any(Array));
  });

  it("saveBundle deletes all publishing accounts if array is empty", async () => {
    const pool = makePool({});
    const repo = new ChannelBundleRepository(pool as any);

    const bundle = {
      channel: { id: "ch-1", slug: "ch-1", name: "Chan", description: "", status: "active", logoPath: null, watermarkText: "", channelType: "cuts", createdAt: "now", updatedAt: "now" },
      profile: { channelId: "ch-1", videoLimit: 1, minShortDuration: 10, maxShortDuration: 60, targetShorts: null, videoQuery: null, sortByViews: false, aiProvider: "ollama", aiModel: "m1" },
      focuses: [],
      sources: [],
      publishingAccounts: [] // Empty
    };

    await repo.saveBundle(bundle as any);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM publishing_accounts WHERE channel_id = $1"), ["ch-1"]);
  });

  it("deleteBundle executes delete on managed_channels", async () => {
    const pool = makePool({});
    const repo = new ChannelBundleRepository(pool as any);
    await repo.deleteBundle("ch-1");
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("DELETE FROM managed_channels"), ["ch-1"]);
  });

  it("loadBundles returns empty array if channelIds is empty", async () => {
    const pool = makePool({});
    vi.mocked(queryRows).mockImplementation(async (_pool, sql) => {
        if (sql.includes("managed_channels")) return [];
        return [];
    });

    const repo = new ChannelBundleRepository(pool as any);
    const bundles = await repo.listBundles();
    expect(bundles).toEqual([]);

    // verify lookupByChannel early exit
    expect(queryRows).toHaveBeenCalledTimes(1); // Only for managed_channels, not for related tables
  });

  it("buildBundle defaults channelType to 'cuts' if null", async () => {
    const pool = makePool({});
    vi.mocked(queryRows).mockImplementation(async (_pool, sql) => {
      if (sql.includes("managed_channels")) return [{...dummyChannel, channel_type: null}];
      if (sql.includes("channel_profiles")) return [dummyProfile];
      return [];
    });

    const repo = new ChannelBundleRepository(pool as any);
    const bundles = await repo.listBundles();
    expect(bundles[0].channel.channelType).toBe("cuts");
  });
});
