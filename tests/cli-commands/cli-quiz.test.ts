import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runQuizCommand } from "../../src/cli-commands/cli-quiz.js";
import { loadConfig } from "../../src/core/config.js";
import { runQuizPipeline } from "../../src/core/quiz/quiz-pipeline.js";
import { runQuizManagedChannel } from "../../src/cli-commands/cli-managed.js";
import { logger } from "../../src/core/logger.js";

vi.mock("../../src/core/config.js");
vi.mock("../../src/core/quiz/quiz-pipeline.js");
vi.mock("../../src/cli-commands/cli-managed.js");
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

describe("cli-quiz", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadConfig).mockReturnValue({} as any);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("should run unmanaged with prompt", async () => {
    vi.mocked(runQuizPipeline).mockImplementation(async (c, cb, p) => {
        if(cb) await cb({ stage: "test", progress: 50, message: "msg" } as any);
        return { success: true, youtubeUrl: "url" };
    });
    await runQuizCommand(["--prompt", "test prompt"]);
    expect(runQuizPipeline).toHaveBeenCalledWith(expect.anything(), expect.any(Function), "test prompt");
    expect(runQuizManagedChannel).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ success: true, youtubeUrl: "url" }), "✅ Quiz pipeline completed");
  });

  it("should run managed channel without prompt", async () => {
    await runQuizCommand(["--managed-channel", "ch1"]);
    expect(runQuizManagedChannel).toHaveBeenCalledWith("ch1", undefined, expect.anything());
    expect(runQuizPipeline).not.toHaveBeenCalled();
  });

  it("should run unmanaged without prompt", async () => {
    vi.mocked(runQuizPipeline).mockResolvedValue({ success: false });
    await runQuizCommand([]);
    expect(runQuizPipeline).toHaveBeenCalledWith(expect.anything(), expect.any(Function), undefined);
  });
});
