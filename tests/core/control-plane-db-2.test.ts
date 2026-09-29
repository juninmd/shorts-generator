import { test, expect, vi } from "vitest";
import { queryRows } from "../../src/core/control-plane-db.js";

vi.mock("../../src/core/sqlite-db.js", () => ({
  getLocalPool: vi.fn().mockReturnValue({ isSqlite: true }),
}));

test("queryRows full branch coverage", async () => {
    const mockClient = {
        query: async () => ({ rows: [] })
    };
    await queryRows(mockClient as any, "SELECT 1", undefined);
});

test("getControlPlanePool with sqlite", async () => {
    const { getControlPlanePool } = await import("../../src/core/control-plane-db.js");
    const pool = getControlPlanePool({ databaseUrl: "sqlite:test.db" });
    expect(pool).toEqual({ isSqlite: true });
});
