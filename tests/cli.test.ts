import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runInteractive } from "../src/cli-interactive.js";
import { runGenerateCommand } from "../src/cli-commands/cli-generate.js";
import { runQuizCommand } from "../src/cli-commands/cli-quiz.js";
import { runMetricsDigestCommand } from "../src/cli-commands/cli-metrics-digest.js";
import { startServer } from "../src/server/index.js";
import { logger } from "../src/core/logger.js";
import * as queueClient from "../src/core/queue-client.js";
import * as queue from "../src/core/queue.js";
import * as comic from "../src/cli-commands/cli-comic.js";
import * as faceless from "../src/cli-commands/cli-faceless.js";

vi.mock("../src/cli-interactive.js");
vi.mock("../src/cli-commands/cli-generate.js");
vi.mock("../src/cli-commands/cli-quiz.js");
vi.mock("../src/cli-commands/cli-metrics-digest.js");
vi.mock("../src/server/index.js");
vi.mock("../src/core/logger.js", () => ({ logger: { fatal: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../src/core/queue-client.js", () => ({ closeQueueConnections: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/core/queue.js", () => ({ processQueueUntilEmpty: vi.fn().mockResolvedValue(undefined), retryFailedWithExistingFiles: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/cli-commands/cli-comic.js", () => ({ runComicCommand: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/cli-commands/cli-faceless.js", () => ({ runFacelessCommand: vi.fn().mockResolvedValue(undefined) }));

const originalArgv = process.argv;
const originalEnv = process.env;

describe("cli", () => {
  let consoleSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.argv = ["node", "cli.ts"];
    process.env = { ...originalEnv };
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const runCli = async (args: string[]) => {
    process.argv = ["node", "cli.ts", ...args];
    vi.resetModules();
    await import("../src/cli.js");
    await new Promise(process.nextTick);
  };

  it("should run generate command", async () => {
    await runCli(["generate"]);
    expect(runGenerateCommand).toHaveBeenCalledWith("generate", ["generate"]);
  });

  it("should run generate:top command", async () => {
    await runCli(["generate:top"]);
    expect(runGenerateCommand).toHaveBeenCalledWith("generate:top", ["generate:top"]);
  });

  it("should run generate:quiz command", async () => {
    await runCli(["generate:quiz"]);
    expect(runQuizCommand).toHaveBeenCalledWith(["generate:quiz"]);
  });

  it("should run generate:metrics-digest command", async () => {
    await runCli(["generate:metrics-digest"]);
    expect(runMetricsDigestCommand).toHaveBeenCalled();
  });

  it("should run generate:faceless command", async () => {
    await runCli(["generate:faceless", "--topic", "x"]);
    expect(faceless.runFacelessCommand).toHaveBeenCalledWith(["generate:faceless", "--topic", "x"]);
  });

  it("should run generate:comic command", async () => {
    await runCli(["generate:comic"]);
    expect(comic.runComicCommand).toHaveBeenCalledWith("comic", ["generate:comic"]);
  });

  it("should run queue:process command", async () => {
    await runCli(["queue:process"]);
    expect(queue.processQueueUntilEmpty).toHaveBeenCalled();
  });

  it("should run queue:retry command", async () => {
    await runCli(["queue:retry"]);
    expect(queue.retryFailedWithExistingFiles).toHaveBeenCalled();
  });

  it("should run server command with port", async () => {
    process.env.PORT = "4000";
    await runCli(["server"]);
    expect(startServer).toHaveBeenCalledWith("4000");
  });

  it("should run server command with default port", async () => {
    delete process.env.PORT;
    await runCli(["server"]);
    expect(startServer).toHaveBeenCalledWith("3000");
  });

  it("should run interactive command", async () => {
    await runCli(["interactive"]);
    expect(runInteractive).toHaveBeenCalled();
  });

  it("should print usage on default", async () => {
    await runCli([]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });

  it("should handle error", async () => {
    vi.mocked(runGenerateCommand).mockRejectedValueOnce(new Error("fail"));
    await runCli(["generate"]);
    expect(logger.fatal).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
