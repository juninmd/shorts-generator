import { beforeEach, describe, expect, it, vi } from "vitest";
import { DelayedError } from "bullmq";
import { getLocalPool } from "../../src/core/sqlite-db.js";
import { runControlPlaneMigrations } from "../../src/core/control-plane-migrations.js";
import { QuizBankRepository } from "../../src/core/quiz/quiz-bank-repository.js";
import { enqueueRun } from "../../src/core/runs/run-queue.js";
import { enqueuePublication, publicationJobId } from "../../src/core/publication/publication-queue.js";
import { hydrateJobConfig, toJobConfig } from "../../src/core/queue-client.js";
import { seedQuizBank } from "../../src/cli-commands/cli-worker.js";
import { processPublicationJob, processRunJob } from "../../src/worker/worker.js";

vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const executeRun = vi.hoisted(() => vi.fn());
const publishPublication = vi.hoisted(() => vi.fn());
vi.mock("../../src/core/runs/run-executor.js", () => ({ executeRun }));
vi.mock("../../src/core/publication/publish-service.js", () => ({ publishPublication }));

const job = (data: object) => ({ data, moveToDelayed: vi.fn(async () => undefined) }) as never;

beforeEach(() => vi.clearAllMocks());

describe("worker processors", () => {
  it("delays a deferred run without consuming an attempt", async () => {
    executeRun.mockResolvedValueOnce({ status: "deferred", reason: "lease" });
    const j = job({ runId: "r", channelId: "c" });
    await expect(processRunJob({ runDeps: {} } as never, j, "tok")).rejects.toBeInstanceOf(DelayedError);
    expect((j as { moveToDelayed: ReturnType<typeof vi.fn> }).moveToDelayed).toHaveBeenCalledWith(expect.any(Number), "tok");
  });

  it("refreshes the run status after a publication job", async () => {
    publishPublication.mockResolvedValueOnce({ status: "published" });
    const refreshStatus = vi.fn(async () => "published");
    const ctx = { publishDeps: {}, publications: { get: vi.fn(async () => ({ runId: "run-9" })) }, runs: { refreshStatus } } as never;
    expect(await processPublicationJob(ctx, job({ publicationId: "p", version: 2 }))).toEqual({ status: "published" });
    expect(refreshStatus).toHaveBeenCalledWith("run-9");
  });
});

describe("queue payloads", () => {
  it("use stable job ids and carry references only", async () => {
    const add = vi.fn(async () => undefined);
    await enqueueRun({ runId: "r1", channelId: "c" }, 0, { add } as never);
    await enqueuePublication({ publicationId: "p1", version: 3 }, { add } as never);
    expect(add.mock.calls.map((c) => (c as unknown[])[2])).toMatchObject([{ jobId: "run-r1-0" }, { jobId: publicationJobId("p1", 3) }]);
    expect(JSON.stringify(add.mock.calls)).not.toMatch(/token|secret|refresh/i);
  });

  it("strips credentials from queued pipeline configs and hydrates them from env", () => {
    const config = {
      outputDir: "/o", litellmApiKey: "sk-live", telegramBotToken: "tg", youtubeCookiesBase64: "cookie-b64",
      youtubeAuth: { refreshToken: "rt" }, onProgress: () => undefined,
    } as never;
    const stored = toJobConfig(config);
    expect(JSON.stringify(stored)).not.toMatch(/sk-live|"tg"|"rt"|cookie-b64/);
    const hydrated = hydrateJobConfig(stored, { LITELLM_KEY: "from-env" } as never);
    expect(hydrated).toMatchObject({ litellmApiKey: "from-env" });
    expect((hydrated as { youtubeAuth?: unknown }).youtubeAuth).toBeUndefined();
  });
});

describe("quiz bank seed", () => {
  it("loads every seed question as pending_review and is idempotent", async () => {
    const db = getLocalPool({ databaseUrl: "sqlite::memory:" });
    await runControlPlaneMigrations(db);
    const bank = new QuizBankRepository(db);
    const count = await seedQuizBank(bank);
    expect(count).toBeGreaterThanOrEqual(9);
    await seedQuizBank(bank);
    const items = await bank.list(undefined, 100);
    expect(items).toHaveLength(count);
    expect(items.every((q) => q.status === "pending_review" && q.source?.url.startsWith("https://pt.wikipedia.org/"))).toBe(true);
    expect(await bank.approvedUnused("geografia", "quiz-1")).toHaveLength(0);
  });
});
