import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerRunRoutes } from "../../src/server/admin-run-routes.js";
import { runPipeline } from "../../src/core/pipeline.js";
import { runQuizPipeline } from "../../src/core/quiz/quiz-pipeline.js";

vi.mock("../../src/core/pipeline.js", () => ({
  runPipeline: vi.fn().mockResolvedValue([])
}));

vi.mock("../../src/core/quiz/quiz-pipeline.js", () => ({
  runQuizPipeline: vi.fn().mockResolvedValue({ quiz: { tema: "t", fato_curioso: "f" }, outputPath: "out" })
}));

describe("Admin Run Routes", () => {
  let app: Hono;
  let mockDeps: any;

  beforeEach(() => {
    app = new Hono();
    mockDeps = {
      runRepository: {
        createRun: vi.fn().mockResolvedValue(undefined),
        updateProgress: vi.fn().mockResolvedValue(undefined),
        completeRun: vi.fn().mockResolvedValue(undefined),
        failRun: vi.fn().mockResolvedValue(undefined),
        listRuns: vi.fn().mockResolvedValue([]),
        getRun: vi.fn()
      },
      resolver: {
        resolveRunConfig: vi.fn().mockResolvedValue({
          channel: { id: "test", name: "test", channelType: "cuts", status: "active" },
          profile: {},
          focuses: [],
          sources: [],
          publishingAccount: { accountId: "acc", provider: "yt", accountIdentifier: "id", token: "tok" }
        })
      }
    };
    registerRunRoutes(app, mockDeps);
  });

  it("POST /channels/:channelId/runs creates cuts run", async () => {
    const res = await app.request("/channels/test/runs", { method: "POST" });
    expect(res.status).toBe(202);

    // allow async pipeline to run
    await new Promise(r => setTimeout(r, 10));

    expect(mockDeps.runRepository.createRun).toHaveBeenCalled();
    expect(runPipeline).toHaveBeenCalled();
    expect(mockDeps.runRepository.completeRun).toHaveBeenCalled();
  });

  it("POST /channels/:channelId/runs fails when cuts mode and quiz channel", async () => {
    process.env.CHANNEL_FLOW_MODE = "cuts";
    mockDeps.resolver.resolveRunConfig.mockResolvedValueOnce({
      channel: { channelType: "quiz" },
      publishingAccount: {}
    });

    const res = await app.request("/channels/test/runs", { method: "POST" });
    expect(res.status).toBe(409);
    process.env.CHANNEL_FLOW_MODE = "";
  });

  it("POST /channels/:channelId/runs creates quiz run", async () => {
    mockDeps.resolver.resolveRunConfig.mockResolvedValueOnce({
      channel: { id: "test", name: "test", channelType: "quiz", status: "active" },
      profile: {},
      focuses: [],
      sources: [],
      publishingAccount: { accountId: "acc", provider: "yt", accountIdentifier: "id", token: "tok" }
    });

    const res = await app.request("/channels/test/runs", { method: "POST" });
    expect(res.status).toBe(202);

    // allow async pipeline to run
    await new Promise(r => setTimeout(r, 10));

    expect(runQuizPipeline).toHaveBeenCalled();
    expect(mockDeps.runRepository.completeRun).toHaveBeenCalled();
  });

  it("POST /channels/:channelId/runs fails run on error", async () => {
    vi.mocked(runPipeline).mockRejectedValueOnce(new Error("fail"));

    const res = await app.request("/channels/test/runs", { method: "POST" });
    expect(res.status).toBe(202);

    // allow async pipeline to run
    await new Promise(r => setTimeout(r, 10));

    expect(mockDeps.runRepository.failRun).toHaveBeenCalled();
  });

  it("GET /runs works", async () => {
    const res = await app.request("/runs?channelId=test&limit=10&offset=0");
    expect(res.status).toBe(200);
    expect(mockDeps.runRepository.listRuns).toHaveBeenCalledWith("test", 10, 0);
  });

  it("GET /runs works without query params", async () => {
    const res = await app.request("/runs");
    expect(res.status).toBe(200);
    expect(mockDeps.runRepository.listRuns).toHaveBeenCalledWith(undefined, 20, 0);
  });

  it("GET /runs/:runId returns run if exists", async () => {
    mockDeps.runRepository.getRun.mockResolvedValue({ id: "run1" });
    const res = await app.request("/runs/run1");
    expect(res.status).toBe(200);
  });

  it("GET /runs/:runId returns 404 if missing", async () => {
    mockDeps.runRepository.getRun.mockResolvedValue(null);
    const res = await app.request("/runs/run1");
    expect(res.status).toBe(404);
  });

  it("GET /runs works when offset/limit not provided defaults", async () => {
    const res = await app.request("/runs?channelId=test");
    expect(res.status).toBe(200);
    expect(mockDeps.runRepository.listRuns).toHaveBeenCalledWith("test", 20, 0);
  });

  it("POST /channels/:channelId/runs covers runRepository.updateProgress empty catch when thrown by updateProgress", async () => {
    mockDeps.resolver.resolveRunConfig.mockResolvedValueOnce({
      channel: { id: "test", name: "test", channelType: "quiz", status: "active" },
      profile: {},
      focuses: [],
      sources: [],
      publishingAccount: { accountId: "acc", provider: "yt", accountIdentifier: "id", token: "tok" }
    });

    mockDeps.runRepository.updateProgress.mockRejectedValueOnce(new Error("db fail"));

    // Mock runQuizPipeline to invoke progress callback
    vi.mocked(runQuizPipeline).mockImplementationOnce(async (cfg, cb) => {
      if (cb) await cb({ stage: "generating_quiz", progress: 50, message: "msg" });
      return { quiz: { tema: "t", fato_curioso: "f" }, outputPath: "out" } as any;
    });

    const res = await app.request("/channels/test/runs", { method: "POST" });
    expect(res.status).toBe(202);

    // allow async pipeline to run
    await new Promise(r => setTimeout(r, 10));

    expect(mockDeps.runRepository.updateProgress).toHaveBeenCalled();
  });

  it("POST /channels/:channelId/runs fails appropriately when runQuizPipeline throws", async () => {
    mockDeps.resolver.resolveRunConfig.mockResolvedValueOnce({
      channel: { id: "test", name: "test", channelType: "quiz", status: "active" },
      profile: {},
      focuses: [],
      sources: [],
      publishingAccount: { accountId: "acc", provider: "yt", accountIdentifier: "id", token: "tok" }
    });

    vi.mocked(runQuizPipeline).mockRejectedValueOnce(new Error("quiz pipeline failed"));

    const res = await app.request("/channels/test/runs", { method: "POST" });
    expect(res.status).toBe(202);

    // allow async pipeline to run
    await new Promise(r => setTimeout(r, 10));

    expect(mockDeps.runRepository.failRun).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
  });

  it("POST /channels/:channelId/runs fails appropriately when runQuizPipeline throws with callback", async () => {
    mockDeps.resolver.resolveRunConfig.mockResolvedValueOnce({
      channel: { id: "test", name: "test", channelType: "quiz", status: "active" },
      profile: {},
      focuses: [],
      sources: [],
      publishingAccount: { accountId: "acc", provider: "yt", accountIdentifier: "id", token: "tok" }
    });

    vi.mocked(runQuizPipeline).mockImplementationOnce(async (cfg, cb) => {
      // Intentionally simulate a failure during pipeline while passing the callback
      throw new Error("quiz pipeline failed");
    });

    const res = await app.request("/channels/test/runs", { method: "POST" });
    expect(res.status).toBe(202);

    // allow async pipeline to run
    await new Promise(r => setTimeout(r, 10));

    expect(mockDeps.runRepository.failRun).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
  });

  it("POST /channels/:channelId/runs covers catch in updateProgress for quiz", async () => {
    mockDeps.resolver.resolveRunConfig.mockResolvedValueOnce({
      channel: { id: "test", name: "test", channelType: "quiz", status: "active" },
      profile: {},
      focuses: [],
      sources: [],
      publishingAccount: { accountId: "acc", provider: "yt", accountIdentifier: "id", token: "tok" }
    });

    mockDeps.runRepository.updateProgress.mockRejectedValueOnce(new Error("db failure"));

    vi.mocked(runQuizPipeline).mockImplementationOnce(async (cfg, cb) => {
      // invoke callback that will throw and hopefully catch
      if (cb) await cb({ stage: "generating_quiz", progress: 0, message: "" });
      return { quiz: { tema: "t", fato_curioso: "f" }, outputPath: "out" } as any;
    });

    const res = await app.request("/channels/test/runs", { method: "POST" });
    expect(res.status).toBe(202);

    await new Promise(r => setTimeout(r, 10));
    expect(mockDeps.runRepository.updateProgress).toHaveBeenCalled();
  });

  it("POST /channels/:channelId/runs covers runPipeline progress callback and catch", async () => {
    mockDeps.resolver.resolveRunConfig.mockResolvedValueOnce({
      channel: { id: "test", name: "test", channelType: "cuts", status: "active" },
      profile: {},
      focuses: [],
      sources: [],
      publishingAccount: { accountId: "acc", provider: "yt", accountIdentifier: "id", token: "tok" }
    });

    mockDeps.runRepository.updateProgress.mockRejectedValueOnce(new Error("db fail"));

    // Mock runPipeline to invoke progress callback
    vi.mocked(runPipeline).mockImplementationOnce(async (cfg, cb) => {
      if (cb) cb({ stage: "analyzing" as any, progress: 50, message: "msg" });
      return [];
    });

    const res = await app.request("/channels/test/runs", { method: "POST" });
    expect(res.status).toBe(202);

    // allow async pipeline to run
    await new Promise(r => setTimeout(r, 10));

    expect(mockDeps.runRepository.updateProgress).toHaveBeenCalled();
  });

  describe("durable runs", () => {
    beforeEach(() => {
      app = new Hono();
      Object.assign(mockDeps.runRepository, {
        createQueuedRun: vi.fn().mockResolvedValue(undefined),
        markFailed: vi.fn().mockResolvedValue(undefined),
        getExecutionState: vi.fn(),
        requeue: vi.fn(),
      });
      mockDeps.enqueueRun = vi.fn().mockResolvedValue(undefined);
      registerRunRoutes(app, mockDeps);
    });

    it("queues the run by reference instead of executing in the API process", async () => {
      vi.mocked(runPipeline).mockClear();
      const res = await app.request("/channels/test/runs", { method: "POST" });
      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.status).toBe("queued");
      expect(mockDeps.runRepository.createQueuedRun).toHaveBeenCalledWith(body.runId, "test", "system", expect.any(Object), { kind: "cuts" });
      expect(mockDeps.enqueueRun).toHaveBeenCalledWith({ runId: body.runId, channelId: "test" });
      expect(JSON.stringify(mockDeps.enqueueRun.mock.calls)).not.toContain("tok");
      expect(runPipeline).not.toHaveBeenCalled();
    });

    it("marks the run failed and answers 503 when the queue is unavailable", async () => {
      mockDeps.enqueueRun.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      const res = await app.request("/channels/test/runs", { method: "POST" });
      expect(res.status).toBe(503);
      expect(mockDeps.runRepository.markFailed).toHaveBeenCalled();
    });

    it("retries only failed runs", async () => {
      mockDeps.runRepository.getExecutionState.mockResolvedValue({ channelId: "test", status: "failed", attempts: 2 });
      mockDeps.runRepository.requeue.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      expect((await app.request("/runs/r1/retry", { method: "POST" })).status).toBe(202);
      expect(mockDeps.enqueueRun).toHaveBeenCalledWith({ runId: "r1", channelId: "test" }, "retry2");
      expect((await app.request("/runs/r1/retry", { method: "POST" })).status).toBe(409);
      mockDeps.runRepository.getExecutionState.mockResolvedValueOnce(null);
      expect((await app.request("/runs/nope/retry", { method: "POST" })).status).toBe(404);
    });
  });
});
