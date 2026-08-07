import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/core/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// pg Pool must be mocked as a constructor
const mockPoolInstance = {
  on: vi.fn(),
  query: vi.fn().mockResolvedValue({ rows: [] }),
  connect: vi.fn(),
};
vi.mock("pg", () => {
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const Pool = vi.fn(function PoolMock() { return mockPoolInstance; });
  return { Pool };
});

describe("control-plane-db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules(); // reset module-level `pool` singleton
  });

  describe("getControlPlanePool", () => {
    it("creates a pool on first call and registers error handler", async () => {
      const { getControlPlanePool } = await import("../../src/core/control-plane-db.js");
      const pool = getControlPlanePool({ databaseUrl: "postgres://user:pass@host/db" });
      expect(pool).toBe(mockPoolInstance);
      expect(mockPoolInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
    });

    it("returns the same singleton on second call", async () => {
      const { getControlPlanePool } = await import("../../src/core/control-plane-db.js");
      const p1 = getControlPlanePool({ databaseUrl: "postgres://user:pass@host/db" });
      const p2 = getControlPlanePool({ databaseUrl: "postgres://user:pass@host/db" });
      expect(p1).toBe(p2);
    });

    it("pool error handler logs via logger", async () => {
      const { getControlPlanePool } = await import("../../src/core/control-plane-db.js");
      const { logger } = await import("../../src/core/logger.js");
      getControlPlanePool({ databaseUrl: "postgres://user:pass@host/db" });
      const [, handler] = mockPoolInstance.on.mock.calls.find(([e]) => e === "error") ?? [];
      if (handler) (handler as Function)(new Error("pool crash"));
      expect(logger.error).toHaveBeenCalled();
    });

    it("logs redacted URL (invalid URL falls back to postgres://***)", async () => {
      const { getControlPlanePool } = await import("../../src/core/control-plane-db.js");
      const { logger } = await import("../../src/core/logger.js");
      getControlPlanePool({ databaseUrl: "not-a-valid-url" });
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ databaseUrl: "postgres://***" }),
        expect.any(String),
      );
    });
  });

  describe("withTransaction", () => {
    it("commits on successful work", async () => {
      const { withTransaction } = await import("../../src/core/control-plane-db.js");
      const client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() };
      vi.mocked(mockPoolInstance.connect).mockResolvedValue(client as any);
      const result = await withTransaction(mockPoolInstance as any, async () => "ok");
      expect(result).toBe("ok");
      expect(client.query).toHaveBeenCalledWith("COMMIT");
      expect(client.release).toHaveBeenCalled();
    });

    it("uses withTransaction method if available on db object", async () => {
      const { withTransaction } = await import("../../src/core/control-plane-db.js");
      const dbWithTransaction = {
        withTransaction: vi.fn().mockImplementation(async (work) => work({}))
      };

      const result = await withTransaction(dbWithTransaction as any, async () => "ok");

      expect(result).toBe("ok");
      expect(dbWithTransaction.withTransaction).toHaveBeenCalled();
    });

    it("rolls back and rethrows on error", async () => {
      const { withTransaction } = await import("../../src/core/control-plane-db.js");
      const client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() };
      vi.mocked(mockPoolInstance.connect).mockResolvedValue(client as any);
      await expect(
        withTransaction(mockPoolInstance as any, async () => { throw new Error("work failed"); }),
      ).rejects.toThrow("work failed");
      expect(client.query).toHaveBeenCalledWith("ROLLBACK");
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe("queryRows", () => {
    it("returns rows from query result", async () => {
      const { queryRows } = await import("../../src/core/control-plane-db.js");
      const client = { query: vi.fn().mockResolvedValue({ rows: [{ id: "1" }] }) };
      const rows = await queryRows(client as any, "SELECT 1", []);
      expect(rows).toEqual([{ id: "1" }]);
    });
  });

  describe("getOptionalPool", () => {
    it("returns null when DATABASE_URL is not set", async () => {
      const orig = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      const { getOptionalPool } = await import("../../src/core/control-plane-db.js");
      expect(getOptionalPool()).toBeNull();
      if (orig !== undefined) process.env.DATABASE_URL = orig;
    });

    it("returns pool when DATABASE_URL is set", async () => {
      const orig = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://user:pass@host/db";
      const { getOptionalPool } = await import("../../src/core/control-plane-db.js");
      expect(getOptionalPool()).toBeDefined();
      if (orig !== undefined) {
        process.env.DATABASE_URL = orig;
      } else {
        delete process.env.DATABASE_URL;
      }
    });
  });

  describe("getControlPlanePool with sqlite", () => {
    it("calls getLocalPool if url starts with sqlite:", async () => {
      vi.mock("../../src/core/sqlite-db.js", () => ({
        getLocalPool: vi.fn().mockReturnValue({ isSqlite: true }),
      }));
      const { getControlPlanePool } = await import("../../src/core/control-plane-db.js");
      const pool = getControlPlanePool({ databaseUrl: "sqlite:test.db" });
      expect(pool).toEqual({ isSqlite: true });
    });
  });

  describe("getControlPlanePool coverage gaps", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
    });
    it("returns existing pool if already initialized", async () => {
      const { getControlPlanePool } = await import("../../src/core/control-plane-db.js");
      const p1 = getControlPlanePool({ databaseUrl: "postgres://user:pass@host/db" });
      const p2 = getControlPlanePool({ databaseUrl: "postgres://user:pass@host/db" });
      expect(p1).toBe(p2);
    });
  });

  describe("redactDatabaseUrl", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetModules();
    });
    it("redacts valid urls", async () => {
        const { getControlPlanePool } = await import("../../src/core/control-plane-db.js");
        const { logger } = await import("../../src/core/logger.js");
        vi.mocked(logger.info).mockClear();
        getControlPlanePool({ databaseUrl: "postgres://user:password@host/db" });
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({ databaseUrl: "postgres://user:***@host/db" }),
          expect.any(String),
        );
    });
    it("handles urls without password", async () => {
        const { getControlPlanePool } = await import("../../src/core/control-plane-db.js");
        const { logger } = await import("../../src/core/logger.js");
        vi.mocked(logger.info).mockClear();
        getControlPlanePool({ databaseUrl: "postgres://user@host/db" });
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({ databaseUrl: "postgres://user@host/db" }),
          expect.any(String),
        );
    });
  });
});
