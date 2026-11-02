import { beforeEach, describe, expect, it, vi } from "vitest";
import { runPipeline } from "../../src/core/pipeline.js";
import { cancelJob, currentSignal } from "../../src/core/run-context.js";
import { startJob } from "../../src/server/job-runner.js";
import { completeJob, failJob, updateJobProgress } from "../../src/server/job-store.js";
import type { PipelineConfig } from "../../src/types.js";

vi.mock("../../src/core/pipeline.js", () => ({ runPipeline: vi.fn() }));
vi.mock("../../src/server/job-store.js", () => ({
  completeJob: vi.fn(), failJob: vi.fn(), updateJobProgress: vi.fn(),
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("job runner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("completes the job and forwards progress", async () => {
    vi.mocked(runPipeline).mockImplementation(async (_config, onProgress) => {
      onProgress?.({ stage: "done", message: "m", progress: 100 });
      return [];
    });
    startJob("a", {} as PipelineConfig);
    await settle();
    expect(updateJobProgress).toHaveBeenCalledWith("a", expect.objectContaining({ progress: 100 }));
    expect(completeJob).toHaveBeenCalledWith("a", []);
    expect(cancelJob("a")).toBe(false);
  });

  it("aborts the running pipeline when the job is cancelled and records the failure", async () => {
    vi.mocked(runPipeline).mockImplementation(() => new Promise((_resolve, reject) => {
      currentSignal()!.addEventListener("abort", () => reject(new Error("Job cancelado")));
    }));
    startJob("b", {} as PipelineConfig);
    await settle();
    expect(cancelJob("b")).toBe(true);
    await settle();
    expect(failJob).toHaveBeenCalledWith("b", expect.objectContaining({ message: "Job cancelado" }));
  });

  it("logs a failure to record the failure", async () => {
    vi.mocked(runPipeline).mockRejectedValue(new Error("x"));
    vi.mocked(failJob).mockRejectedValueOnce(new Error("db")).mockResolvedValue(undefined as never);
    startJob("c", {} as PipelineConfig);
    await settle();
    expect(failJob).toHaveBeenCalledTimes(2);
  });
});
