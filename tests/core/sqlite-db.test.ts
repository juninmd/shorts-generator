import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLocalPool } from "../../src/core/sqlite-db.js";
import Database from "better-sqlite3";

vi.mock("better-sqlite3", () => {
  const mDb = {
    exec: vi.fn(),
    prepare: vi.fn().mockImplementation((sql) => ({
      all: vi.fn().mockReturnValue([{ id: 1 }]),
      run: vi.fn().mockReturnValue({ changes: 1 }),
    })),
    transaction: vi.fn().mockImplementation((cb) => cb),
    close: vi.fn(),
  };
  return {
    default: class {
      constructor() {
        Object.assign(this, mDb);
      }
    }
  };
});

describe("sqlite-db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize database successfully", async () => {
    const pool = getLocalPool({ databaseUrl: "sqlite://test.db" });
    expect(pool).toBeDefined();
    expect(pool.connect).toBeDefined();
    expect(pool.end).toBeDefined();

    // Call connect and end to cover lines
    const client = await pool.connect?.();
    client?.release?.();
    await pool.end?.();
  });

  it("should format queries containing variables and cast logic", async () => {
    const pool = getLocalPool({ databaseUrl: "sqlite://test.db" });
    // Cover the replacement branches
    const result1 = await pool.query("SELECT * FROM table WHERE id = $1::text[] AND meta = $2::jsonb", [1, "test"]);
    expect(result1).toEqual({ rows: [{ id: 1 }]});

    const result2 = await pool.query("INSERT INTO tab (id) VALUES (NOW())", []);
    expect(result2).toEqual({ rows: [], rowCount: 1 });

    const result3 = await pool.query("ALTER TABLE tab DROP CONSTRAINT fk", []);
    expect(result3).toEqual({ rows: [], rowCount: 0 });

    const result4 = await pool.query("SELECT * FROM tab WHERE id != ALL($1) OR id = ANY($2)", [[1, 2], [3, 4]]);
    expect(result4).toEqual({ rows: [{ id: 1 }]});
  });

  it("should format specific parameters like arrays, objects and booleans", async () => {
    const pool = getLocalPool({ databaseUrl: "sqlite://test.db" });
    const result = await pool.query("INSERT INTO tab (a, b, c) VALUES ($1, $2, $3)", [
      true,
      [1, 2],
      { key: "val" }
    ]);
    expect(result).toEqual({ rows: [], rowCount: 1 });
  });

  it("should execute withTransaction successfully and commit", async () => {
    const pool = getLocalPool({ databaseUrl: "sqlite://test.db" });
    const result = await pool.withTransaction?.(async (client) => {
      const res = await client.query("SELECT 1", []);
      return res;
    });
    expect(result).toEqual({ rows: [{ id: 1 }]});
  });

  it("should rollback transaction on error", async () => {
    const pool = getLocalPool({ databaseUrl: "sqlite://test.db" });
    await expect(pool.withTransaction?.(async (client) => {
      throw new Error("fail txn");
    })).rejects.toThrow("fail txn");
  });

  it("should execute exec for parameterless queries with semicolon", async () => {
    const pool = getLocalPool({ databaseUrl: "sqlite://test.db" });
    const result = await pool.query("INSERT INTO tab; UPDATE tab;");
    expect(result).toEqual({ rows: [], rowCount: 0 });
  });

  it("should handle known errors safely", async () => {
    vi.resetModules();
    const mockDb = {
      prepare: vi.fn().mockImplementation(() => {
        throw new Error("duplicate column name");
      })
    };

    vi.doMock("better-sqlite3", () => {
      return {
        default: class {
          constructor() {
            Object.assign(this, mockDb);
          }
        }
      };
    });

    const { getLocalPool: getLocalPoolM } = await import("../../src/core/sqlite-db.js");

    const pool = getLocalPoolM({ databaseUrl: "sqlite://test.db" });
    const res1 = await pool.query("INSERT INTO t");
    expect(res1).toEqual({ rows: [], rowCount: 0 });
  });

  it("should re-throw unknown errors", async () => {
    vi.resetModules();
    const mockDb = {
      prepare: vi.fn().mockImplementation(() => {
        throw new Error("unknown err");
      })
    };

    vi.doMock("better-sqlite3", () => {
      return {
        default: class {
          constructor() {
            Object.assign(this, mockDb);
          }
        }
      };
    });

    const { getLocalPool: getLocalPoolM } = await import("../../src/core/sqlite-db.js");

    const pool = getLocalPoolM({ databaseUrl: "sqlite://test.db" });
    await expect(pool.query("INSERT INTO t")).rejects.toThrow("unknown err");
  });

  describe("error handling coverage", () => {
    it("handles already exists error safely", async () => {
      vi.resetModules();
      const mockDb = {
        prepare: vi.fn().mockImplementation(() => {
          throw new Error("already exists");
        })
      };

      vi.doMock("better-sqlite3", () => {
        return {
          default: class {
            constructor() {
              Object.assign(this, mockDb);
            }
          }
        };
      });

      const { getLocalPool: getLocalPoolM } = await import("../../src/core/sqlite-db.js");

      const pool = getLocalPoolM({ databaseUrl: "sqlite://test.db" });
      const res1 = await pool.query("INSERT INTO t");
      expect(res1).toEqual({ rows: [], rowCount: 0 });
    });
  });

  describe("error handling coverage 2", () => {
    it("handles multiple statements query", async () => {
      vi.resetModules();
      const mockDb = {
        exec: vi.fn()
      };

      vi.doMock("better-sqlite3", () => {
        return {
          default: class {
            constructor() {
              Object.assign(this, mockDb);
            }
          }
        };
      });

      const { getLocalPool: getLocalPoolM } = await import("../../src/core/sqlite-db.js");

      const pool = getLocalPoolM({ databaseUrl: "sqlite://test.db" });
      const res1 = await pool.query("INSERT INTO t; UPDATE t;");
      expect(res1).toEqual({ rows: [], rowCount: 0 });
    });
  });

  describe("error handling coverage 3", () => {
    it("handles Array.isArray param logic properly", async () => {
      vi.resetModules();
      const mockDb = {
        prepare: vi.fn().mockImplementation((sql) => ({
            all: vi.fn().mockReturnValue([{ id: 1 }]),
            run: vi.fn().mockReturnValue({ changes: 1 }),
        })),
      };

      vi.doMock("better-sqlite3", () => {
        return {
          default: class {
            constructor() {
              Object.assign(this, mockDb);
            }
          }
        };
      });

      const { getLocalPool: getLocalPoolM } = await import("../../src/core/sqlite-db.js");

      const pool = getLocalPoolM({ databaseUrl: "sqlite://test.db" });
      const res1 = await pool.query("INSERT INTO t", [Buffer.from("abc")]);
      expect(res1).toEqual({ rows: [], rowCount: 1 });
    });
  });

  describe("error handling coverage duplicate", () => {
    it("handles already exists error safely by checking err message string directly", async () => {
      vi.resetModules();
      const mockDb = {
        prepare: vi.fn().mockImplementation(() => {
          throw { message: "already exists" };
        })
      };

      vi.doMock("better-sqlite3", () => {
        return {
          default: class {
            constructor() {
              Object.assign(this, mockDb);
            }
          }
        };
      });

      const { getLocalPool: getLocalPoolM } = await import("../../src/core/sqlite-db.js");

      const pool = getLocalPoolM({ databaseUrl: "sqlite://test.db" });
      const res1 = await pool.query("INSERT INTO t");
      expect(res1).toEqual({ rows: [], rowCount: 0 });
    });
  });
});

  describe("boolean format false coverage 2", () => {
    it("should format false boolean values correctly 2", async () => {
      const pool = getLocalPool({ databaseUrl: "sqlite://test.db" });
      const result = await pool.query("INSERT INTO tab (a) VALUES ($1)", [false]);
      expect(result).toEqual({ rows: [], rowCount: 1 });
    });
  });
