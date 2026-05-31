import { describe, expect, it, vi } from "vitest";
import { ChannelConfigResolver, buildManagedPipelineConfig } from "../../src/core/channel-config-resolver.js";
import { loadConfig } from "../../src/core/config.js";

describe("ChannelConfigResolver", () => {
  it("throws when channel bundle not found", async () => {
    const repository = { getBundle: vi.fn().mockResolvedValue(null) };
    const secretStore = { decryptToken: vi.fn(), encryptToken: vi.fn() };
    const resolver = new ChannelConfigResolver(repository as any, secretStore as any);
    await expect(resolver.resolveRunConfig("run-1", "missing")).rejects.toThrow("Managed channel not found");
  });

  it("throws when channel is inactive", async () => {
    const repository = { getBundle: vi.fn().mockResolvedValue({ channel: { status: "inactive" }, sources: [{}], publishingAccounts: [] }) };
    const secretStore = { decryptToken: vi.fn(), encryptToken: vi.fn() };
    const resolver = new ChannelConfigResolver(repository as any, secretStore as any);
    await expect(resolver.resolveRunConfig("run-1", "ch-1")).rejects.toThrow("Managed channel is inactive");
  });

  it("throws when no YouTube publishing account", async () => {
    const repository = {
      getBundle: vi.fn().mockResolvedValue({
        channel: { id: "ch-1", status: "active", slug: "ch-1", name: "Ch", description: "d", logoPath: null, watermarkText: "wm", channelType: "cuts" as const, createdAt: "", updatedAt: "" },
        sources: [{ id: "s1", kind: "youtube_channel", value: "UC1", label: "S", createdAt: "" }],
        publishingAccounts: [], // no youtube account
        focuses: [],
        profile: {},
      }),
    };
    const secretStore = { decryptToken: vi.fn(), encryptToken: vi.fn() };
    const resolver = new ChannelConfigResolver(repository as any, secretStore as any);
    await expect(resolver.resolveRunConfig("run-1", "ch-1")).rejects.toThrow("YouTube publishing account");
  });

  it("resolves an active managed channel into a snapshot and pipeline config", async () => {
    const repository = {
      getBundle: vi.fn().mockResolvedValue({
        channel: {
          id: "canal-1",
          slug: "canal-1",
          name: "Canal 1",
          description: "desc",
          status: "active",
          logoPath: null,
          watermarkText: "Canal 1",
          channelType: "cuts" as const,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
        profile: {
          channelId: "canal-1",
          videoLimit: 4,
          minShortDuration: 15,
          maxShortDuration: 59,
          targetShorts: 2,
          videoQuery: "igreja",
          sortByViews: true,
          aiProvider: "ollama",
          aiModel: "gemma3:1b",
        },
        focuses: [{ id: "f1", key: "catolicos", label: "Católicos" }],
        sources: [{ id: "s1", kind: "youtube_channel", value: "UC123", label: "Fonte", createdAt: "2024-01-01T00:00:00.000Z" }],
        publishingAccounts: [{
          id: "acc1",
          channelId: "canal-1",
          provider: "youtube",
          label: "YT",
          status: "active",
          accountIdentifier: "channel@example.com",
          clientId: "client-id",
          clientSecret: "client-secret",
          encryptedToken: { keyVersion: "v1", iv: "iv", authTag: "tag", ciphertext: "cipher" },
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }],
      }),
    };
    const secretStore = {
      decryptToken: vi.fn().mockReturnValue("refresh-token"),
      encryptToken: vi.fn(),
    };

    const resolver = new ChannelConfigResolver(repository as any, secretStore as any);
    const resolved = await resolver.resolveRunConfig("run-1", "canal-1");
    const config = buildManagedPipelineConfig(loadConfig(), "run-1", resolved);

    expect(resolved.publishingAccount.token).toBe("refresh-token");
    expect(config.channels).toEqual(["UC123"]);
    expect(config.managedRun?.channelId).toBe("canal-1");
    expect(config.youtubeAuth?.refreshToken).toBe("refresh-token");
  });

  it("fails when the channel has no source targets", async () => {
    const repository = {
      getBundle: vi.fn().mockResolvedValue({
        channel: { id: "canal-1", slug: "slug", name: "Canal", description: "desc", status: "active", logoPath: null, watermarkText: "wm", channelType: "cuts" as const, createdAt: "now", updatedAt: "now" },
        profile: { channelId: "canal-1", videoLimit: 1, minShortDuration: 15, maxShortDuration: 59, targetShorts: null, videoQuery: null, sortByViews: false, aiProvider: "ollama", aiModel: "gemma3:1b" },
        focuses: [],
        sources: [],
        publishingAccounts: [],
      }),
    };
    const resolver = new ChannelConfigResolver(repository as any, { decryptToken: vi.fn(), encryptToken: vi.fn() } as any);

    await expect(resolver.resolveRunConfig("run-1", "canal-1")).rejects.toThrow("Managed channel requires at least one source target");
  });
});