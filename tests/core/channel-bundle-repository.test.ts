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
      const repo = new ChannelBundleRepository(db as any);

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
      const repo = new ChannelBundleRepository(db as any);

      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockResolvedValue([]);

      const bundle = await repo.getBundle("ch1");
      expect(bundle).toBeNull();
    });

    it("should return bundle if found", async () => {
      const db = { query: vi.fn() };
      const repo = new ChannelBundleRepository(db as any);

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
      const repo = new ChannelBundleRepository({ query: mockQuery } as any);
      await repo.deleteBundle("ch1");
      expect(mockQuery).toHaveBeenCalledWith("DELETE FROM managed_channels WHERE id = $1", ["ch1"]);
    });
  });

  describe("saveBundle", () => {
    it("should save bundle using transaction", async () => {
      const mockClient = { query: vi.fn().mockResolvedValue({}) };
      const db = { query: mockClient.query };
      const repo = new ChannelBundleRepository(db as any);

      vi.mocked(withTransaction).mockImplementation(async (db, cb) => {
        return cb(mockClient as any);
      });

      const mockBundle = {
        channel: { id: "ch1", channelType: "cuts", channelType2: "abc" },
        profile: { channelId: "ch1" },
        focuses: [{ id: "f1", key: "k1", label: "l1" }],
        sources: [{ id: "s1", kind: "k", value: "v", label: "l", createdAt: "d" }],
        publishingAccounts: [
          {
            id: "a1", channelId: "ch1", provider: "p1", encryptedToken: {
              keyVersion: "v1", iv: "iv1", authTag: "t1", ciphertext: "c1"
            }
          },
          {
            id: "a2", channelId: "ch1", provider: "p2", encryptedToken: {
              keyVersion: "v2", iv: "iv2", authTag: "t2", ciphertext: "c2"
            }
          }
        ]
      } as any;

      await repo.saveBundle(mockBundle);
      expect(withTransaction).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledTimes(9); // includes DELETE queries

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM publishing_accounts WHERE channel_id = $1 AND provider != ALL($2::text[])"),
        ["ch1", ["p1", "p2"]]
      );
    });

    it("should save bundle correctly if channelType is undefined", async () => {
      const mockClient = { query: vi.fn().mockResolvedValue({}) };
      const db = { query: mockClient.query };
      const repo = new ChannelBundleRepository(db as any);

      vi.mocked(withTransaction).mockImplementation(async (db, cb) => {
        return cb(mockClient as any);
      });

      const mockBundle = {
        channel: { id: "ch1", channelType: undefined },
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
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO managed_channels"),
        expect.arrayContaining(["cuts"]) // defaults to "cuts" if channelType is undefined
      );
    });

    it("should clear all publishing accounts if array is empty", async () => {
      const mockClient = { query: vi.fn().mockResolvedValue({}) };
      const repo = new ChannelBundleRepository({ query: mockClient.query } as any);

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

    it("should handle replaceChildren correctly without crashing", async () => {
      const mockClient = { query: vi.fn().mockResolvedValue({}) };
      const repo = new ChannelBundleRepository({ query: mockClient.query } as any);

      vi.mocked(withTransaction).mockImplementation(async (db, cb) => {
        return cb(mockClient as any);
      });

      const mockBundle = {
        channel: { id: "ch1", channelType: "cuts" },
        profile: { channelId: "ch1" },
        focuses: [{ id: "f1", key: "k1", label: "l1" }, { id: "f2", focus_key: "k2", focus_label: "l2" }],
        sources: [{ id: "s1", kind: "k", value: "v", label: "l", createdAt: "d" }, { id: "s2", kind: "k2", value: "v2", label: "l2", created_at: "d2" }],
        publishingAccounts: []
      } as any;

      await repo.saveBundle(mockBundle);

      expect(mockClient.query).toHaveBeenCalledWith(
        "DELETE FROM channel_focuses WHERE channel_id = $1", ["ch1"]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        "INSERT INTO channel_focuses (id, channel_id, focus_key, focus_label) VALUES ($1,$2,$3,$4)",
        ["f1", "ch1", "k1", "l1"]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        "INSERT INTO channel_focuses (id, channel_id, focus_key, focus_label) VALUES ($1,$2,$3,$4)",
        ["f2", "ch1", undefined, undefined]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        "DELETE FROM source_targets WHERE channel_id = $1", ["ch1"]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        "INSERT INTO source_targets (id, channel_id, kind, value, label, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        ["s1", "ch1", "k", "v", "l", "d"]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        "INSERT INTO source_targets (id, channel_id, kind, value, label, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        ["s2", "ch1", "k2", "v2", "l2", undefined]
      );
    });
  });

  describe("updatePublishingAccount", () => {
    it("should update publishing account", async () => {
      const mockQuery = vi.fn();
      const repo = new ChannelBundleRepository({ query: mockQuery } as any);

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
      const repo = new ChannelBundleRepository({ query: vi.fn() } as any);
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
      const repo = new ChannelBundleRepository({ query: vi.fn() } as any);
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockImplementation((db, query, params) => {
        if ((query as string).includes("managed_channels")) {
          return Promise.resolve([{ id: "ch1", channel_type: "cuts", channel_type2: undefined }]);
        }
        if ((query as string).includes("channel_profiles")) {
          return Promise.resolve([{ channel_id: "ch1" }]);
        }
        if ((query as string).includes("channel_focuses")) {
          return Promise.resolve([{ channel_id: "ch1", focus_key: "k1", focus_label: "l1", id: "f1", key: undefined, label: undefined }]);
        }
        if ((query as string).includes("source_targets")) {
          return Promise.resolve([{ channel_id: "ch1", created_at: "2024-01-01", id: "s1", createdAt: undefined }]);
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
      expect(bundle?.channel.channelType).toBe("cuts");
    });

    it("should fallback to 'cuts' if channel_type is missing from db", async () => {
      const repo = new ChannelBundleRepository({ query: vi.fn() } as any);
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockImplementation((db, query, params) => {
        if ((query as string).includes("managed_channels")) {
          return Promise.resolve([{ id: "ch1" }]); // missing channel_type
        }
        if ((query as string).includes("channel_profiles")) {
          return Promise.resolve([{ channel_id: "ch1" }]);
        }
        return Promise.resolve([]);
      });

      const bundle = await repo.getBundle("ch1");

      expect(bundle?.channel.channelType).toBe("cuts");
    });

    it("should map focus properly when 'key' or 'label' exist", async () => {
      const repo = new ChannelBundleRepository({ query: vi.fn() } as any);
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockImplementation((db, query, params) => {
        if ((query as string).includes("managed_channels")) {
          return Promise.resolve([{ id: "ch1" }]);
        }
        if ((query as string).includes("channel_profiles")) {
          return Promise.resolve([{ channel_id: "ch1" }]);
        }
        if ((query as string).includes("channel_focuses")) {
          return Promise.resolve([{ channel_id: "ch1", key: "k1", label: "l1", id: "f1" }]);
        }
        return Promise.resolve([]);
      });
      const bundle = await repo.getBundle("ch1");
      expect(bundle?.focuses[0]?.key).toBe("k1");
      expect(bundle?.focuses[0]?.label).toBe("l1");
    });

    it("should map source properly when 'createdAt' exist", async () => {
      const repo = new ChannelBundleRepository({ query: vi.fn() } as any);
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockImplementation((db, query, params) => {
        if ((query as string).includes("managed_channels")) {
          return Promise.resolve([{ id: "ch1" }]);
        }
        if ((query as string).includes("channel_profiles")) {
          return Promise.resolve([{ channel_id: "ch1" }]);
        }
        if ((query as string).includes("source_targets")) {
          return Promise.resolve([{ channel_id: "ch1", createdAt: "2024-01-01", id: "s1" }]);
        }
        return Promise.resolve([]);
      });
      const bundle = await repo.getBundle("ch1");
      expect(bundle?.sources[0]?.createdAt).toBe("2024-01-01");
    });
  });

  describe("lookupByChannel", () => {
    it("should return empty array if no channelIds are provided", async () => {
      const db = { query: vi.fn() };
      const repo = new ChannelBundleRepository(db as any);

      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockResolvedValue([]);

      const bundles = await repo.listBundles();
      expect(bundles).toEqual([]);
    });

    it("should handle error with bad params in lookupByChannel", async () => {
      const db = { query: vi.fn() };
      const repo = new ChannelBundleRepository(db as any);

      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockRejectedValueOnce(new Error("test error"));

      await expect(repo.listBundles()).rejects.toThrow("test error");
    });

    it("should map gracefully with edge case inputs to lookupByChannel", async () => {
      const repo = new ChannelBundleRepository({ query: vi.fn() } as any);

      const { queryRows } = await import("../../src/core/control-plane-db.js");
      vi.mocked(queryRows).mockImplementation(async (db, query, params) => {
        if ((query as string).includes("channel_profiles")) {
          return Promise.resolve([{ channel_id: "ch1" }]);
        }
        return Promise.resolve([]);
      });
      // The internal method is private but can be triggered from listBundles with results
      vi.mocked(queryRows).mockImplementationOnce(async (db, query, params) => {
        return Promise.resolve([{ id: "ch1" }]);
      });

      const res = await repo.listBundles();
      expect(res).toBeDefined();
    });
  });

  describe("updatePublishingAccount edge cases", () => {
    it("should handle partial updates without encrypted token", async () => {
      const mockQuery = vi.fn();
      const repo = new ChannelBundleRepository({ query: mockQuery } as any);

      await repo.updatePublishingAccount("acc1", {
        updatedAt: "now"
      });

      expect(mockQuery).toHaveBeenCalledWith(
        "UPDATE publishing_accounts SET updated_at = $2 WHERE id = $1",
        ["acc1", "now"]
      );
    });

    it("should handle partial updates with undefined clientId and clientSecret", async () => {
      const mockQuery = vi.fn();
      const repo = new ChannelBundleRepository({ query: mockQuery } as any);

      await repo.updatePublishingAccount("acc1", {
        updatedAt: "now",
        clientId: undefined,
        clientSecret: undefined
      });

      expect(mockQuery).toHaveBeenCalledWith(
        "UPDATE publishing_accounts SET updated_at = $2 WHERE id = $1",
        ["acc1", "now"]
      );
    });

    it("should handle update with token only", async () => {
      const mockQuery = vi.fn();
      const repo = new ChannelBundleRepository({ query: mockQuery } as any);

      await repo.updatePublishingAccount("acc1", {
        updatedAt: "now",
        encryptedToken: { keyVersion: "v", iv: "i", authTag: "a", ciphertext: "c" }
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("token_key_version = $3"),
        expect.arrayContaining(["acc1", "now", "v", "i", "a", "c"])
      );
    });

    it("should execute queries with all fields correctly", async () => {
        const mockQuery = vi.fn();
        const repo = new ChannelBundleRepository({ query: mockQuery } as any);

        await repo.updatePublishingAccount("acc1", {
            updatedAt: "now",
            clientId: "c",
            clientSecret: "s",
            encryptedToken: { keyVersion: "v", iv: "i", authTag: "a", ciphertext: "c" }
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("client_id = $7"),
          expect.arrayContaining(["c"])
        );
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("client_secret = $8"),
          expect.arrayContaining(["s"])
        );
    });

    it("should execute queries properly using array map internally in replaceChildren", async () => {
        const mockClient = { query: vi.fn().mockResolvedValue({}) };
        const repo = new ChannelBundleRepository({ query: mockClient.query } as any);
        vi.mocked(withTransaction).mockImplementation(async (db, cb) => cb(mockClient as any));

        const mockBundle = {
          channel: { id: "ch1" },
          profile: { channelId: "ch1" },
          focuses: [{ id: "f1", focus_key: "k1", focus_label: "l1" }],
          sources: [],
          publishingAccounts: []
        } as any;

        await repo.saveBundle(mockBundle);

        expect(mockClient.query).toHaveBeenCalledWith(
          "INSERT INTO channel_focuses (id, channel_id, focus_key, focus_label) VALUES ($1,$2,$3,$4)",
          ["f1", "ch1", undefined, undefined]
        );
    });
  });
});
