import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelBundleRepository } from "../../src/core/channel-bundle-repository.js";
import { withTransaction } from "../../src/core/control-plane-db.js";

vi.mock("../../src/core/control-plane-db.js", () => ({
  getControlPlanePool: vi.fn().mockReturnValue({ query: vi.fn() }),
  queryRows: vi.fn(),
  withTransaction: vi.fn(),
}));

describe("channel-bundle-repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listBundles", () => {
    it("should query bundles correctly", async () => {
      const db = { query: vi.fn() };
      const repo = new ChannelBundleRepository(db);

      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockImplementation((db, query, params) => {
        if ((query as string).includes("managed_channels")) {
          return Promise.resolve([{ id: "ch1" }]);
        }
        if ((query as string).includes("channel_profiles")) {
          return Promise.resolve([{ channel_id: "ch1" }]);
        }
        return Promise.resolve([]);
      });

      const bundles = await repo.listBundles();
      expect(bundles).toHaveLength(1);
      expect(bundles[0].channel.id).toBe("ch1");
    });
  });

  describe("getBundle", () => {
    it("should return null if channel not found", async () => {
      const db = { query: vi.fn() };
      const repo = new ChannelBundleRepository(db);

      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockResolvedValue([]);

      const bundle = await repo.getBundle("ch1");
      expect(bundle).toBeNull();
    });

    it("should return bundle if found", async () => {
      const db = { query: vi.fn() };
      const repo = new ChannelBundleRepository(db);

      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockImplementation((db, query, params) => {
        if ((query as string).includes("managed_channels")) {
          return Promise.resolve([{ id: "ch1" }]);
        }
        if ((query as string).includes("channel_profiles")) {
          return Promise.resolve([{ channel_id: "ch1" }]);
        }
        return Promise.resolve([]);
      });

      const bundle = await repo.getBundle("ch1");
      expect(bundle).toBeDefined();
      expect(bundle?.channel.id).toBe("ch1");
    });
  });

  describe("deleteBundle", () => {
    it("should delete channel by id", async () => {
      const mockQuery = vi.fn();
      const repo = new ChannelBundleRepository({ query: mockQuery });
      await repo.deleteBundle("ch1");
      expect(mockQuery).toHaveBeenCalledWith("DELETE FROM managed_channels WHERE id = $1", ["ch1"]);
    });
  });

  describe("saveBundle", () => {
    it("should save bundle using transaction", async () => {
      const mockClient = { query: vi.fn().mockResolvedValue({}) };
      const db = { query: mockClient.query };
      const repo = new ChannelBundleRepository(db);

      vi.mocked(withTransaction).mockImplementation(async (db, cb) => {
        return cb(mockClient as any);
      });

      const mockBundle = {
        channel: { id: "ch1", channelType: "cuts" },
        profile: { channelId: "ch1" },
        focuses: [{ id: "f1", key: "k1", label: "l1" }],
        sources: [{ id: "s1", kind: "k", value: "v", label: "l", createdAt: "d" }],
        publishingAccounts: [
          {
            id: "a1", channelId: "ch1", provider: "p1", encryptedToken: {
              keyVersion: "v1", iv: "iv1", authTag: "t1", ciphertext: "c1"
            }
          }
        ]
      } as any;

      await repo.saveBundle(mockBundle);
      expect(withTransaction).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledTimes(8); // includes DELETE queries
    });

    it("should clear all publishing accounts if array is empty", async () => {
      const mockClient = { query: vi.fn().mockResolvedValue({}) };
      const repo = new ChannelBundleRepository({ query: mockClient.query });

      vi.mocked(withTransaction).mockImplementation(async (db, cb) => {
        return cb(mockClient as any);
      });

      const mockBundle = {
        channel: { id: "ch1", channelType: "cuts" },
        profile: { channelId: "ch1" },
        focuses: [],
        sources: [],
        publishingAccounts: []
      } as any;

      await repo.saveBundle(mockBundle);
      expect(mockClient.query).toHaveBeenCalledWith("DELETE FROM publishing_accounts WHERE channel_id = $1", ["ch1"]);
    });
  });

  describe("updatePublishingAccount", () => {
    it("should update publishing account", async () => {
      const mockQuery = vi.fn();
      const repo = new ChannelBundleRepository({ query: mockQuery });

      await repo.updatePublishingAccount("acc1", {
        updatedAt: "now",
        clientId: "cid",
        clientSecret: "sec",
        encryptedToken: {
          keyVersion: "v1", iv: "iv1", authTag: "t1", ciphertext: "c1"
        }
      });

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe("buildBundle edge cases", () => {
    it("should throw if profile is missing", async () => {
      const repo = new ChannelBundleRepository({ query: vi.fn() });
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockImplementation((db, query, params) => {
        if ((query as string).includes("managed_channels")) {
          return Promise.resolve([{ id: "ch1" }]);
        }
        if ((query as string).includes("channel_profiles")) {
          return Promise.resolve([]); // Missing profile!
        }
        return Promise.resolve([]);
      });

      await expect(repo.getBundle("ch1")).rejects.toThrow("Missing profile for channel ch1");
    });

    it("should map snake_case snake_case fields correctly from db", async () => {
      const repo = new ChannelBundleRepository({ query: vi.fn() });
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockImplementation((db, query, params) => {
        if ((query as string).includes("managed_channels")) {
          return Promise.resolve([{ id: "ch1", channel_type: "cuts" }]);
        }
        if ((query as string).includes("channel_profiles")) {
          return Promise.resolve([{ channel_id: "ch1" }]);
        }
        if ((query as string).includes("channel_focuses")) {
          return Promise.resolve([{ channel_id: "ch1", focus_key: "k1", focus_label: "l1", id: "f1" }]);
        }
        if ((query as string).includes("source_targets")) {
          return Promise.resolve([{ channel_id: "ch1", created_at: "2024-01-01", id: "s1" }]);
        }
        if ((query as string).includes("publishing_accounts")) {
          return Promise.resolve([{ channel_id: "ch1", id: "a1", token_key_version: "tk1" }]);
        }
        return Promise.resolve([]);
      });

      const bundle = await repo.getBundle("ch1");

      expect(bundle?.focuses[0]?.key).toBe("k1");
      expect(bundle?.focuses[0]?.label).toBe("l1");
      expect(bundle?.sources[0]?.createdAt).toBe("2024-01-01");
      expect(bundle?.publishingAccounts[0]?.encryptedToken.keyVersion).toBe("tk1");
    });
  });

  describe("lookupByChannel", () => {
    it("should return empty array if no channelIds are provided", async () => {
      const db = { query: vi.fn() };
      const repo = new ChannelBundleRepository(db);

      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockResolvedValue([]);

      const bundles = await repo.listBundles();
      expect(bundles).toEqual([]);
    });
  });

  describe("updatePublishingAccount edge cases", () => {
    it("should handle partial updates without encrypted token", async () => {
      const mockQuery = vi.fn();
      const repo = new ChannelBundleRepository({ query: mockQuery });

      await repo.updatePublishingAccount("acc1", {
        updatedAt: "now"
      });

      expect(mockQuery).toHaveBeenCalledWith(
        "UPDATE publishing_accounts SET updated_at = $2 WHERE id = $1",
        ["acc1", "now"]
      );
    });
  });
});
