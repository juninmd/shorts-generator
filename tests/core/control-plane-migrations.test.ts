import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReaddir, mockReadFile } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: { readdir: mockReaddir, readFile: mockReadFile },
}));
vi.mock("../../src/core/control-plane-db.js", () => ({
  queryRows: vi.fn(),
  withTransaction: vi.fn(),
}));
vi.mock("../../src/core/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { queryRows, withTransaction } from "../../src/core/control-plane-db.js";
import { runControlPlaneMigrations } from "../../src/core/control-plane-migrations.js";

function makeDb() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;
}

describe("runControlPlaneMigrations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates migrations table and applies new migration files", async () => {
    const db = makeDb();
    mockReaddir.mockResolvedValue(["001_init.sql"]);
    vi.mocked(queryRows).mockResolvedValue([]); // not applied yet
    mockReadFile.mockResolvedValue("CREATE TABLE foo (id TEXT);");
    vi.mocked(withTransaction).mockImplementation(async (_, work) => work({ query: vi.fn().mockResolvedValue({}) } as any));

    await runControlPlaneMigrations(db);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS control_plane_migrations"));
    expect(withTransaction).toHaveBeenCalledTimes(1);
  });

  it("skips already applied migrations", async () => {
    const db = makeDb();
    mockReaddir.mockResolvedValue(["001_init.sql"]);
    vi.mocked(queryRows).mockResolvedValue([{ name: "001_init.sql" }]); // already applied

    await runControlPlaneMigrations(db);
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("handles empty migrations directory", async () => {
    const db = makeDb();
    mockReaddir.mockResolvedValue([]);
    await runControlPlaneMigrations(db);
    expect(withTransaction).not.toHaveBeenCalled();
  });
});
