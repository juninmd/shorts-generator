import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runGenerateCommand } from "../../src/cli-commands/cli-generate.js";
import { loadConfig } from "../../src/core/config.js";
import { runPipeline, runTopVideoPipeline } from "../../src/core/pipeline.js";
import { runManagedChannel } from "../../src/cli-commands/cli-managed.js";
import { logger } from "../../src/core/logger.js";

vi.mock("../../src/core/config.js");
vi.mock("../../src/core/pipeline.js");
vi.mock("../../src/cli-commands/cli-managed.js");
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

describe("cli-generate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadConfig).mockReturnValue({} as any);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("should process all overrides", async () => {
    await runGenerateCommand("generate", ["--url", "url1, url2", "--channel", "ch1,ch2", "--limit", "2", "--clips", "3", "--target-shorts", "5", "--full", "2", "--query", "q"]);
    expect(loadConfig).toHaveBeenCalledWith(expect.objectContaining({
      specificUrls: ["url1", "url2"],
      channels: ["ch1", "ch2"],
      videoLimit: 2,
      maxClipsOverride: 3,
      minShortsPerVideo: 3,
      targetShorts: 5,
      fullVideoCount: 2,
      videoQuery: "q"
    }));
    expect(runPipeline).toHaveBeenCalled();
  });

  it("passes --genre and --prompt to the analyzer config", async () => {
    await runGenerateCommand("generate", ["--genre", "podcast", "--prompt", "momentos engraçados"]);
    expect(loadConfig).toHaveBeenCalledWith(expect.objectContaining({ videoGenre: "podcast", clipPrompt: "momentos engraçados" }));
  });

  it("should handle url without channel", async () => {
    await runGenerateCommand("generate", ["--url", "url1"]);
    expect(loadConfig).toHaveBeenCalledWith(expect.objectContaining({ specificUrls: ["url1"], channels: [] }));
  });

  it("should handle generate:top unmanaged", async () => {
    vi.mocked(runTopVideoPipeline).mockImplementation(async (c, cb) => {
        if(cb) await cb({ stage: "test", progress: 50, message: "msg" } as any);
    });
    await runGenerateCommand("generate:top", ["--full", "2"]);
    expect(runTopVideoPipeline).toHaveBeenCalledTimes(2);
  });

  it("should run pipeline unmanaged", async () => {
    vi.mocked(runPipeline).mockImplementation(async (c, cb) => {
        if(cb) await cb({ stage: "test", progress: 50, message: "msg" } as any);
        return [];
    });
    await runGenerateCommand("generate", []);
    expect(runPipeline).toHaveBeenCalled();
  });

  it("should handle managed channel", async () => {
    await runGenerateCommand("generate", ["--managed-channel", "ch1"]);
    expect(runManagedChannel).toHaveBeenCalledWith("ch1", expect.anything(), expect.anything());
  });

  it("should throw for managed channel with generate:top", async () => {
    await expect(runGenerateCommand("generate:top", ["--managed-channel", "ch1"])).rejects.toThrow("generate:top not supported yet for managed runs");
  });

  it("should ignore invalid clips and target shorts", async () => {
    await runGenerateCommand("generate", ["--clips", "invalid", "--target-shorts", "invalid", "--full", "invalid"]);
    expect(loadConfig).toHaveBeenCalledWith(expect.not.objectContaining({ maxClipsOverride: expect.anything(), targetShorts: expect.anything() }));
  });
});
