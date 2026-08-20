import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChannelBundleRepository } from "../../src/core/channel-bundle-repository.js";
import { withTransaction, queryRows } from "../../src/core/control-plane-db.js";
import type { ManagedChannelBundle } from "../../src/core/channel-domain.js";

vi.mock("../../src/core/control-plane-db.js", () => ({
  withTransaction: vi.fn(),
  queryRows: vi.fn(),
}));

describe("ChannelBundleRepository", () => {
  let mockDb: any;
  let repo: ChannelBundleRepository;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    repo = new ChannelBundleRepository(mockDb);
    vi.clearAllMocks();
  });

  describe("listBundles", () => {
    it("should return empty array if no channels are returned", async () => {
      vi.mocked(queryRows).mockResolvedValueOnce([]);

      const result = await repo.listBundles();
      expect(result).toEqual([]);
      expect(queryRows).toHaveBeenCalledWith(
        mockDb,
        "SELECT * FROM managed_channels ORDER BY name ASC"
      );
    });

    it("should fetch bundles and map fields correctly", async () => {
      vi.mocked(queryRows)
        .mockResolvedValueOnce([{ id: "ch1", name: "test", channel_type: "shorts" }]) // channels
        .mockResolvedValueOnce([{ channel_id: "ch1" }]) // profiles
        .mockResolvedValueOnce([{ channel_id: "ch1", focus_key: "f_key", focus_label: "f_label" }]) // focuses
        .mockResolvedValueOnce([{ channel_id: "ch1", created_at: "date" }]) // sources
        .mockResolvedValueOnce([{ channel_id: "ch1" }]); // accounts

      const result = await repo.listBundles();
      expect(result.length).toBe(1);
      expect(result[0]!.channel.id).toBe("ch1");
      expect(result[0]!.channel.channelType).toBe("shorts");
      expect(result[0]!.focuses[0]!.key).toBe("f_key");
      expect(result[0]!.sources[0]!.createdAt).toBe("date");
    });

    it("should fallback channelType if empty", async () => {
      vi.mocked(queryRows)
        .mockResolvedValueOnce([{ id: "ch1", name: "test", channel_type: undefined }]) // channels
        .mockResolvedValueOnce([{ channel_id: "ch1" }]) // profiles
        .mockResolvedValueOnce([]) // focuses
        .mockResolvedValueOnce([]) // sources
        .mockResolvedValueOnce([]); // accounts

      const result = await repo.listBundles();
      expect(result.length).toBe(1);
      expect(result[0]!.channel.id).toBe("ch1");
      expect(result[0]!.channel.channelType).toBe("cuts"); // The default fallback
    });
  });

  describe("getBundle", () => {
    it("should return null if channel is not found", async () => {
      vi.mocked(queryRows).mockResolvedValueOnce([]);
      const result = await repo.getBundle("not_exist");
      expect(result).toBeNull();
    });

    it("should return bundle if found", async () => {
      vi.mocked(queryRows)
        .mockResolvedValueOnce([{ id: "ch1", name: "test" }]) // channel
        .mockResolvedValueOnce([{ channel_id: "ch1" }]) // profiles
        .mockResolvedValueOnce([]) // focuses
        .mockResolvedValueOnce([]) // sources
        .mockResolvedValueOnce([]); // accounts

      const result = await repo.getBundle("ch1");
      expect(result).toBeDefined();
      expect(result?.channel.id).toBe("ch1");
    });

    it("should throw if profile is missing", async () => {
      vi.mocked(queryRows)
        .mockResolvedValueOnce([{ id: "ch1" }]) // channel
        .mockResolvedValueOnce([]) // profiles
        .mockResolvedValueOnce([]) // focuses
        .mockResolvedValueOnce([]) // sources
        .mockResolvedValueOnce([]); // accounts

      await expect(repo.getBundle("ch1")).rejects.toThrow("Missing profile for channel ch1");
    });

    it("should return null if loadBundles returns empty list", async () => {
      vi.mocked(queryRows).mockResolvedValueOnce([{ id: "ch1" }]);

      const repoAny = repo as any;
      const loadBundlesOrig = repoAny.loadBundles;
      repoAny.loadBundles = vi.fn().mockResolvedValue([]);

      const result = await repo.getBundle("ch1");
      expect(result).toBeNull();

      repoAny.loadBundles = loadBundlesOrig;
    });
  });

  describe("saveBundle", () => {
    it("should run insert queries for new bundle with accounts", async () => {
      const mockClient = { query: vi.fn() };
      vi.mocked(withTransaction).mockImplementation(async (db, cb) => cb(mockClient as any));

      const bundle: ManagedChannelBundle = {
        channel: { id: "ch1", channelType: "cuts" } as any,
        profile: { channelId: "ch1" } as any,
        focuses: [{ id: "f1", key: "k1", label: "l1" }],
        sources: [{ id: "s1", kind: "k", value: "v", label: "l", createdAt: "c" } as any],
        publishingAccounts: [{
          id: "a1", channelId: "ch1", provider: "p1",
          encryptedToken: { keyVersion: "k", iv: "i", authTag: "a", ciphertext: "c" }
        } as any]
      };

      await repo.saveBundle(bundle);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO managed_channels"),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO channel_profiles"),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO channel_focuses"),
        expect.arrayContaining(["f1", "ch1", "k1", "l1"])
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO source_targets"),
        expect.arrayContaining(["s1", "ch1", "k", "v", "l", "c"])
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO publishing_accounts"),
        expect.arrayContaining(["a1", "ch1", "p1"])
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM publishing_accounts WHERE channel_id = $1 AND provider != ALL($2::text[])"),
        ["ch1", ["p1"]]
      );
    });

    it("should handle empty publishing accounts", async () => {
      const mockClient = { query: vi.fn() };
      vi.mocked(withTransaction).mockImplementation(async (db, cb) => cb(mockClient as any));

      const bundle: ManagedChannelBundle = {
        channel: { id: "ch1", channelType: "" } as any,
        profile: { channelId: "ch1" } as any,
        focuses: [],
        sources: [],
        publishingAccounts: []
      };

      await repo.saveBundle(bundle);

      expect(mockClient.query).toHaveBeenCalledWith(
        "DELETE FROM publishing_accounts WHERE channel_id = $1",
        ["ch1"]
      );
    });
  });

  describe("deleteBundle", () => {
    it("should delete from managed_channels", async () => {
      await repo.deleteBundle("ch1");
      expect(mockDb.query).toHaveBeenCalledWith("DELETE FROM managed_channels WHERE id = $1", ["ch1"]);
    });
  });

  describe("updatePublishingAccount", () => {
    it("should handle partial updates with undefined clientId and clientSecret", async () => {
      await repo.updatePublishingAccount("acc1", {
        updatedAt: "now",
        clientId: undefined,
        clientSecret: undefined
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        "UPDATE publishing_accounts SET updated_at = $2 WHERE id = $1",
        ["acc1", "now"]
      );
    });

    it("should handle update with token only", async () => {
      await repo.updatePublishingAccount("acc1", {
        updatedAt: "now",
        encryptedToken: { keyVersion: "v", iv: "i", authTag: "a", ciphertext: "c" }
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("token_key_version = $3"),
        expect.arrayContaining(["acc1", "now", "v", "i", "a", "c"])
      );
    });

    it("should handle update with all fields", async () => {
      await repo.updatePublishingAccount("acc1", {
          updatedAt: "now",
          clientId: "c",
          clientSecret: "s",
          encryptedToken: { keyVersion: "v", iv: "i", authTag: "a", ciphertext: "c" }
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("client_id = $7"),
        expect.arrayContaining(["c"])
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("client_secret = $8"),
        expect.arrayContaining(["s"])
      );
    });
  });
});
