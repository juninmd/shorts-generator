import { describe, expect, it, vi } from "vitest";
import { ChannelBundleRepository } from "../../src/core/channel-bundle-repository.js";

const baseChannel = {
  id: "ch-1", slug: "ch-1", name: "Canal", description: "desc",
  status: "active", logo_path: null, watermark_text: "wm",
  created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
};
const baseProfile = {
  channel_id: "ch-1", video_limit: 3, min_short_duration: 15, max_short_duration: 59,
  target_shorts: null, video_query: null, sort_by_views: false,
  ai_provider: "ollama", ai_model: "gemma3:1b",
};
const baseAccount = {
  id: "acc-1", channel_id: "ch-1", provider: "youtube", label: "YT",
  status: "active", account_identifier: "ch@example.com",
  client_id: "cid", client_secret: "csec",
  token_key_version: "v1", token_iv: "iv", token_auth_tag: "tag", token_ciphertext: "cipher",
  created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
};

function makePool(queryResults: unknown[][]) {
  let callIndex = 0;
  return {
    query: vi.fn(async () => ({ rows: queryResults[callIndex++] ?? [] })),
    connect: vi.fn(async () => {
      const client = {
        query: vi.fn(async () => ({ rows: [] })),
        release: vi.fn(),
      };
      return client;
    }),
  };
}

describe("ChannelBundleRepository", () => {
  it("listBundles returns mapped bundles with publishingAccounts array", async () => {
    const pool = makePool([[baseChannel], [baseProfile], [], [], [baseAccount]]);
    const repo = new ChannelBundleRepository(pool as any);
    const bundles = await repo.listBundles();

    expect(bundles).toHaveLength(1);
    expect(bundles[0].channel.id).toBe("ch-1");
    expect(bundles[0].publishingAccounts).toHaveLength(1);
    expect(bundles[0].publishingAccounts[0].provider).toBe("youtube");
  });

  it("getBundle returns null when channel not found", async () => {
    const pool = makePool([[]]);
    const repo = new ChannelBundleRepository(pool as any);
    const result = await repo.getBundle("missing");
    expect(result).toBeNull();
  });

  it("getBundle returns bundle when found", async () => {
    const pool = makePool([[baseChannel], [baseProfile], [], [], []]);
    const repo = new ChannelBundleRepository(pool as any);
    const bundle = await repo.getBundle("ch-1");

    expect(bundle).not.toBeNull();
    expect(bundle?.channel.slug).toBe("ch-1");
    expect(bundle?.publishingAccounts).toHaveLength(0);
  });

  it("deleteBundle executes DELETE", async () => {
    const pool = makePool([[]]);
    const repo = new ChannelBundleRepository(pool as any);
    await repo.deleteBundle("ch-1");

    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("DELETE FROM managed_channels");
    expect(params[0]).toBe("ch-1");
  });

  it("listBundles with focuses and sources maps them correctly", async () => {
    const focus = { channel_id: "ch-1", id: "f1", key: "cat", label: "Cat" };
    const source = { channel_id: "ch-1", id: "s1", kind: "youtube_channel" as const, value: "UC123", label: "Src", createdAt: "2024-01-01T00:00:00Z" };
    const pool = makePool([[baseChannel], [baseProfile], [focus], [source], []]);
    const repo = new ChannelBundleRepository(pool as any);
    const bundles = await repo.listBundles();
    expect(bundles[0].focuses).toHaveLength(1);
    expect(bundles[0].focuses[0].key).toBe("cat");
    expect(bundles[0].sources).toHaveLength(1);
    expect(bundles[0].sources[0].kind).toBe("youtube_channel");
  });

  it("buildBundle throws when profile is missing", async () => {
    const pool = makePool([[baseChannel], [], [], [], []]);
    const repo = new ChannelBundleRepository(pool as any);
    await expect(repo.listBundles()).rejects.toThrow("Missing profile");
  });

  it("saveBundle upserts channel, profile, focuses, sources and accounts in transaction", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
    const pool = { query: vi.fn(), connect: vi.fn(async () => client) };
    const repo = new ChannelBundleRepository(pool as any);

    const bundle = {
      channel: { id: "ch-1", slug: "ch-1", name: "C", description: "d", status: "active" as const, logoPath: null, watermarkText: "wm", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
      profile: { channelId: "ch-1", videoLimit: 3, minShortDuration: 15, maxShortDuration: 59, targetShorts: null, videoQuery: null, sortByViews: false, aiProvider: "ollama" as const, aiModel: "gemma3:1b" },
      focuses: [],
      sources: [],
      publishingAccounts: [],
    };

    await repo.saveBundle(bundle);

    const sqlCalls = client.query.mock.calls.map(([sql]: [string]) => sql as string);
    expect(sqlCalls.some((s) => s.includes("BEGIN"))).toBe(true);
    expect(sqlCalls.some((s) => s.includes("INSERT INTO managed_channels"))).toBe(true);
    expect(sqlCalls.some((s) => s.includes("INSERT INTO channel_profiles"))).toBe(true);
    expect(sqlCalls.some((s) => s.includes("COMMIT"))).toBe(true);
  });
});
