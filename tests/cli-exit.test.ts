import { describe, it, expect, vi, beforeEach } from "vitest";

const closeQueueConnections = vi.fn();
const runGenerateCommand = vi.fn();
const runQuizCommand = vi.fn();

vi.mock("dotenv", () => ({ config: vi.fn() }));
vi.mock("../src/core/logger.js", () => ({ logger: { fatal: vi.fn(), info: vi.fn() } }));
vi.mock("../src/server/index.js", () => ({ startServer: vi.fn() }));
vi.mock("../src/cli-interactive.js", () => ({ runInteractive: vi.fn() }));
vi.mock("../src/cli-commands/cli-generate.js", () => ({ runGenerateCommand }));
vi.mock("../src/cli-commands/cli-quiz.js", () => ({ runQuizCommand }));
vi.mock("../src/core/queue.js", () => ({ closeQueueConnections }));

async function runCli(...args: string[]) {
  process.argv = ["node", "cli.ts", ...args];
  vi.resetModules();
  await import("../src/cli.js");
  await vi.waitFor(() => expect(closeQueueConnections).toHaveBeenCalled());
}

// DEFER_UPLOADS enqueues into BullMQ; an open Redis socket kept the CronJob
// process alive for hours after "Pipeline completed" until activeDeadlineSeconds.
describe("CLI releases the Redis connection so batch runs can exit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  it.each(["generate", "generate:top"])("%s closes queue connections", async (command) => {
    runGenerateCommand.mockResolvedValue(undefined);
    await runCli(command, "--", "--limit", "1");
    expect(runGenerateCommand).toHaveBeenCalledWith(command, [command, "--limit", "1"]);
  });

  it("generate closes queue connections even when the pipeline throws", async () => {
    runGenerateCommand.mockRejectedValue(new Error("boom"));
    await runCli("generate");
  });

  it("generate:quiz closes queue connections", async () => {
    runQuizCommand.mockResolvedValue(undefined);
    await runCli("generate:quiz");
  });
});
