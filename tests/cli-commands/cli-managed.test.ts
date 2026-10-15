import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runManagedChannel, runQuizManagedChannel } from "../../src/cli-commands/cli-managed.js";
import { loadConfig } from "../../src/core/config.js";
import { loadControlPlaneConfig } from "../../src/core/control-plane-config.js";
import { getControlPlanePool } from "../../src/core/control-plane-db.js";
import { createSecretStore } from "../../src/core/secret-store.js";
import { runControlPlaneMigrations } from "../../src/core/control-plane-migrations.js";
import { runPipeline } from "../../src/core/pipeline.js";
import { runQuizPipeline } from "../../src/core/quiz/quiz-pipeline.js";

vi.mock("node:crypto", () => ({ randomUUID: () => "uuid" }));
vi.mock("../../src/core/config.js");
vi.mock("../../src/core/control-plane-config.js");
vi.mock("../../src/core/control-plane-db.js");
vi.mock("../../src/core/secret-store.js");
vi.mock("../../src/core/control-plane-migrations.js");
vi.mock("../../src/core/pipeline.js");
vi.mock("../../src/core/quiz/quiz-pipeline.js");
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

const createRunMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const updateProgressMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const completeRunMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const failRunMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const resolveRunConfigMock = vi.hoisted(() => vi.fn().mockResolvedValue({
  channel: {}, profile: {}, focuses: [], sources: [], publishingAccount: { provider: "yt", accountId: "id", accountIdentifier: "id" }
}));

vi.mock("../../src/core/managed-run-repository.js", () => ({
  ManagedRunRepository: class {
    createRun = createRunMock;
    updateProgress = updateProgressMock;
    completeRun = completeRunMock;
    failRun = failRunMock;
  }
}));

vi.mock("../../src/core/channel-bundle-repository.js", () => ({
  ChannelBundleRepository: class {}
}));

vi.mock("../../src/core/channel-config-resolver.js", () => ({
  ChannelConfigResolver: class {
    resolveRunConfig = resolveRunConfigMock;
  },
  buildManagedPipelineConfig: vi.fn().mockReturnValue({})
}));

describe("cli-managed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadControlPlaneConfig).mockReturnValue({} as any);
    vi.mocked(getControlPlanePool).mockReturnValue({} as any);
    vi.mocked(loadConfig).mockReturnValue({} as any);
    vi.mocked(createSecretStore).mockReturnValue({} as any);
    vi.mocked(runControlPlaneMigrations).mockResolvedValue(undefined);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it("should run managed channel successfully", async () => {
    vi.mocked(runPipeline).mockImplementation(async (c, cb) => {
        if(cb) await cb({ stage: "test", progress: 50, message: "msg" } as any);
        return [];
    });
    await runManagedChannel("ch1");
    expect(createRunMock).toHaveBeenCalled();
    expect(updateProgressMock).toHaveBeenCalled();
    expect(completeRunMock).toHaveBeenCalled();
  });

  it("should fail run managed channel on error", async () => {
    vi.mocked(runPipeline).mockRejectedValue(new Error("fail"));
    await expect(runManagedChannel("ch1")).rejects.toThrow("fail");
    expect(failRunMock).toHaveBeenCalled();
  });

  it("should run quiz managed channel successfully", async () => {
    vi.mocked(runQuizPipeline).mockImplementation(async (c, cb) => {
        if(cb) await cb({ stage: "test", progress: 50, message: "msg" } as any);
        return { success: true, youtubeUrl: "url" };
    });
    await runQuizManagedChannel("ch1", "topic");
    expect(createRunMock).toHaveBeenCalled();
    expect(updateProgressMock).toHaveBeenCalled();
    expect(completeRunMock).toHaveBeenCalled();
  });

  it("should fail quiz managed channel on error", async () => {
    vi.mocked(runQuizPipeline).mockRejectedValue(new Error("fail"));
    await expect(runQuizManagedChannel("ch1")).rejects.toThrow("fail");
    expect(failRunMock).toHaveBeenCalled();
  });

  it("should catch and log error on updateProgress fail for quiz", async () => {
    updateProgressMock.mockRejectedValueOnce(new Error("progress fail"));
    vi.mocked(runQuizPipeline).mockImplementation(async (c, cb) => {
        if(cb) await cb({ stage: "test", progress: 50, message: "msg" } as any);
        return { success: true, youtubeUrl: "url" };
    });
    await runQuizManagedChannel("ch1", "topic");
    expect(updateProgressMock).toHaveBeenCalled();
  });
});
