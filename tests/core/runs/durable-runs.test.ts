import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalPool } from "../../../src/core/sqlite-db.js";
import { runControlPlaneMigrations } from "../../../src/core/control-plane-migrations.js";
import { DurableRunRepository } from "../../../src/core/runs/durable-run-repository.js";
import { executeRun, type RunExecutorDeps } from "../../../src/core/runs/run-executor.js";
import { deriveRunStatus } from "../../../src/core/runs/run-status.js";
import type { SqlClient } from "../../../src/core/control-plane-db.js";
import type { PipelineResult } from "../../../src/types.js";

vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

let db: SqlClient;
let runs: DurableRunRepository;

const result = (videoId: string, overrides: Partial<PipelineResult> = {}): PipelineResult => ({
  videoId, videoTitle: videoId, channelName: "c", shorts: [], errors: [], processingTimeMs: 1, ...overrides,
});
const short = (publicationStatus: string) => ({ publicationStatus } as never);

async function addChannel(id: string) {
  const now = new Date().toISOString();
  await db.query("INSERT INTO managed_channels (id, slug, name, description, status, watermark_text, created_at, updated_at) VALUES ($1, $1, $1, '', 'active', '', $2, $2)", [id, now]);
}

function deps(overrides: Partial<RunExecutorDeps> = {}): RunExecutorDeps {
  return {
    runs, owner: "w1", leaseMs: 60_000,
    resolveConfig: async () => ({ config: {} as never, channelType: "cuts", channelName: "c" }),
    ...overrides,
  };
}

beforeEach(async () => {
  db = getLocalPool({ databaseUrl: "sqlite::memory:" });
  await runControlPlaneMigrations(db);
  runs = new DurableRunRepository(db);
  await addChannel("ch1");
  await addChannel("ch2");
});

describe("deriveRunStatus", () => {
  it.each([
    [[result("a", { errors: ["boom"] })], undefined, "failed"],
    [[result("a", { errors: ["boom"], shorts: [short("published")] })], undefined, "partial_failure"],
    [[result("a", { shorts: [short("publish_pending")] })], undefined, "publish_pending"],
    [[result("a", { shorts: [short("pending_review"), short("published")] })], undefined, "review_pending"],
    [[result("a", { shorts: [short("published")] })], undefined, "published"],
    [[result("a", { shorts: [short("generated")] })], ["published", "reconcile_required"], "partial_failure"],
    [[result("a")], [], "generated"],
  ])("derives %#", (results, statuses, expected) => {
    expect(deriveRunStatus(results as PipelineResult[], statuses as string[] | undefined)).toBe(expected);
  });
});

describe("durable run execution", () => {
  it("resumes from the checkpoint without reprocessing finished videos", async () => {
    await runs.createQueuedRun("r1", "ch1", "test", {}, { kind: "cuts" });
    const seen: string[][] = [];
    const crash = vi.fn(async (_c, _p, cp) => {
      seen.push([...cp!.completedVideoIds]);
      await cp!.onVideoDone(result("v1"));
      throw new Error("worker died");
    });
    await expect(executeRun("r1", deps({ runCuts: crash }))).rejects.toThrow("worker died");
    expect((await runs.getExecutionState("r1"))!.status).toBe("failed");

    expect(await runs.requeue("r1")).toBe(true);
    const resume = vi.fn(async (_c, _p, cp) => {
      seen.push([...cp!.completedVideoIds]);
      await cp!.onVideoDone(result("v2"));
      return [result("v2")];
    });
    expect(await executeRun("r1", deps({ runCuts: resume }))).toEqual({ status: "generated" });
    expect(seen).toEqual([[], ["v1"]]);
    const state = (await runs.getExecutionState("r1"))!;
    expect(state.checkpoint.results.map((r) => r.videoId)).toEqual(["v1", "v2"]);
    expect(state.attempts).toBe(2);
    expect(await executeRun("r1", deps({ runCuts: resume }))).toMatchObject({ status: "skipped" });
  });

  it("allows one processing run per channel and defers the other", async () => {
    await runs.createQueuedRun("a", "ch1", "t", {}, { kind: "cuts" });
    await runs.createQueuedRun("b", "ch1", "t", {}, { kind: "cuts" });
    await runs.createQueuedRun("c", "ch2", "t", {}, { kind: "cuts" });
    expect(await runs.acquireLease("a", "ch1", "w1", 60_000)).toBe(true);
    expect(await executeRun("b", deps({ owner: "w2" }))).toMatchObject({ status: "deferred" });
    expect(await runs.acquireLease("c", "ch2", "w2", 60_000)).toBe(true);
  });

  it("takes over a run whose lease expired (crashed worker)", async () => {
    await runs.createQueuedRun("a", "ch1", "t", {}, { kind: "cuts" });
    const past = new Date(Date.now() - 3_600_000);
    expect(await runs.acquireLease("a", "ch1", "dead", 1_000, past)).toBe(true);
    expect(await runs.acquireLease("a", "ch1", "w2", 60_000)).toBe(true);
  });

  it("reports partial failure instead of completed and blocks quiz in cuts-only mode", async () => {
    await runs.createQueuedRun("p", "ch1", "t", {}, { kind: "cuts" });
    const partial = vi.fn(async () => [result("v1", { shorts: [short("published")] }), result("v2", { errors: ["render failed"] })]);
    expect(await executeRun("p", deps({ runCuts: partial }))).toEqual({ status: "partial_failure" });

    process.env.CHANNEL_FLOW_MODE = "cuts";
    try {
      await runs.createQueuedRun("q", "ch2", "t", {}, { kind: "quiz" });
      const quizDeps = deps({ resolveConfig: async () => ({ config: {} as never, channelType: "quiz", channelName: "q" }) });
      await expect(executeRun("q", quizDeps)).rejects.toThrow(/CHANNEL_FLOW_MODE=cuts/);
    } finally {
      delete process.env.CHANNEL_FLOW_MODE;
    }
  });

  it("does not retry a run that is not failed", async () => {
    await runs.createQueuedRun("x", "ch1", "t", {}, { kind: "cuts" });
    expect(await runs.requeue("x")).toBe(false);
    expect(await executeRun("missing", deps())).toMatchObject({ status: "skipped" });
  });
});
