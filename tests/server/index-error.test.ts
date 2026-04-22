import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@hono/node-server", () => ({
  serve: vi.fn((_options, callback) => {
    callback?.({ port: 3001 });
    return { close: vi.fn() };
  }),
}));

vi.mock("dotenv", () => ({ config: vi.fn() }));

vi.mock("../../src/core/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

describe("Server Index error handling", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalArgv: string[];

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalArgv = process.argv;
    process.argv = ["node"];
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  it("rejects invalid PORT values before starting the server", async () => {
    const { serve } = await import("@hono/node-server");
    const { startServer } = await import("../../src/server/index.js");

    expect(() => startServer("abc")).toThrow("Invalid PORT value: abc");
    expect(serve).not.toHaveBeenCalled();
  });

  it("logs and rethrows server startup errors", async () => {
    const { serve } = await import("@hono/node-server");
    const { logger } = await import("../../src/core/logger.js");
    const { startServer } = await import("../../src/server/index.js");
    const startupError = new Error("bind failed");

    vi.mocked(serve).mockImplementationOnce(() => {
      throw startupError;
    });

    expect(() => startServer()).toThrow("bind failed");
    expect(logger.error).toHaveBeenCalledWith(
      { error: startupError, port: 3001 },
      "Failed to start API server",
    );
  });

  it("exits with failure if server close throws during shutdown", async () => {
    const { serve } = await import("@hono/node-server");
    const { logger } = await import("../../src/core/logger.js");
    const { startServer } = await import("../../src/server/index.js");
    const closeError = new Error("close failed");
    const handlers: Record<string, Function> = {};

    vi.mocked(serve).mockReturnValueOnce({ close: vi.fn(() => { throw closeError; }) } as any);
    vi.spyOn(process, "on").mockImplementation((event: string, handler: any) => {
      handlers[event] = handler;
      return process;
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    startServer();
    handlers["SIGTERM"]?.("SIGTERM");

    expect(logger.error).toHaveBeenCalledWith(
      { error: closeError, signal: "SIGTERM" },
      "Error while shutting down server",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
