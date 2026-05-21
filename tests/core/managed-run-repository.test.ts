import { describe, expect, it, vi } from "vitest";
import { ManagedRunRepository } from "../../src/core/managed-run-repository.js";

function makePool(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe("ManagedRunRepository", () => {
  it("createRun executes INSERT with correct params", async () => {
    const pool = makePool();
    const repo = new ManagedRunRepository(pool as any);
    await repo.createRun("run-1", "ch-1", "system", { channel: "snap" });

    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("INSERT INTO pipeline_runs");
    expect(params[0]).toBe("run-1");
    expect(params[1]).toBe("ch-1");
    expect(params[2]).toBe("system");
    expect(params[3]).toBe("processing");
  });

  it("updateProgress executes UPDATE with jsonb progress", async () => {
    const pool = makePool();
    const repo = new ManagedRunRepository(pool as any);
    const progress = { stage: "transcribing" as const, videoId: "v1", videoTitle: "T", message: "ok", progress: 50 };
    await repo.updateProgress("run-1", progress);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("UPDATE pipeline_runs");
    expect(params[0]).toBe("run-1");
    expect(JSON.parse(params[1])).toMatchObject({ stage: "transcribing" });
  });

  it("completeRun sets status to completed with results", async () => {
    const pool = makePool();
    const repo = new ManagedRunRepository(pool as any);
    const results = [{ videoId: "v1", videoTitle: "T", channelName: "C", shorts: [], errors: [], processingTimeMs: 100 }];
    await repo.completeRun("run-1", results);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("UPDATE pipeline_runs");
    expect(params[1]).toBe("completed");
    expect(JSON.parse(params[2])).toHaveLength(1);
  });

  it("failRun sets status to failed with error message", async () => {
    const pool = makePool();
    const repo = new ManagedRunRepository(pool as any);
    await repo.failRun("run-1", new Error("boom"));

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("UPDATE pipeline_runs");
    expect(params[1]).toBe("failed");
    expect(params[2]).toBe("boom");
  });

  it("failRun handles non-Error objects", async () => {
    const pool = makePool();
    const repo = new ManagedRunRepository(pool as any);
    await repo.failRun("run-1", "string error");

    const params = pool.query.mock.calls[0][1];
    expect(params[2]).toBe("string error");
  });

  it("listRuns with channelId filters by channel", async () => {
    const row = { id: "r1", channel_id: "ch-1", requested_by: "sys", status: "completed", progress: null, results: [], error_message: null, created_at: "2024-01-01", updated_at: "2024-01-01" };
    const pool = makePool([row]);
    const repo = new ManagedRunRepository(pool as any);
    const runs = await repo.listRuns("ch-1");

    expect(runs).toHaveLength(1);
    expect(runs[0].channelId).toBe("ch-1");
    expect(runs[0].status).toBe("completed");
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain("channel_id = $1");
  });

  it("listRuns without channelId fetches all", async () => {
    const pool = makePool([]);
    const repo = new ManagedRunRepository(pool as any);
    await repo.listRuns();

    const [sql] = pool.query.mock.calls[0];
    expect(sql).not.toContain("channel_id = $1");
  });

  it("getRun returns null when not found", async () => {
    const pool = makePool([]);
    const repo = new ManagedRunRepository(pool as any);
    const result = await repo.getRun("missing");
    expect(result).toBeNull();
  });

  it("getRun maps row to ManagedRunRecord", async () => {
    const row = { id: "r1", channel_id: "ch-1", requested_by: "sys", status: "processing", progress: null, results: [], error_message: null, created_at: "2024-01-01", updated_at: "2024-01-02" };
    const pool = makePool([row]);
    const repo = new ManagedRunRepository(pool as any);
    const result = await repo.getRun("r1");

    expect(result?.id).toBe("r1");
    expect(result?.createdAt).toBe("2024-01-01");
    expect(result?.errorMessage).toBeNull();
  });
});
