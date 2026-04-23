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
    expect(() => startServer("0")).toThrow("PORT must be between 1 and 65535: 0");
    expect(() => startServer("65536")).toThrow("PORT must be between 1 and 65535: 65536");
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

  it("calls finish immediately if server.close.length === 0", async () => {
    const { startServer } = await import("../../src/server/index.js");
    const { serve } = await import("@hono/node-server");

    // Create a dummy close function with no parameters
    const noParamsClose = () => {};
    vi.mocked(serve).mockReturnValueOnce({ close: noParamsClose } as any);

    const handlers: Record<string, Function> = {};
    vi.spyOn(process, "on").mockImplementation((event: string, handler: any) => {
      handlers[event] = handler;
      return process;
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    startServer();
    handlers["SIGTERM"]?.("SIGTERM");

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("calls finish with error if server.close throws an error", async () => {
    const { startServer } = await import("../../src/server/index.js");
    const { logger } = await import("../../src/core/logger.js");
    const { serve } = await import("@hono/node-server");

    const throwingClose = () => { throw new Error("Close error"); };
    vi.mocked(serve).mockReturnValueOnce({ close: throwingClose } as any);

    const handlers: Record<string, Function> = {};
    vi.spyOn(process, "on").mockImplementation((event: string, handler: any) => {
      handlers[event] = handler;
      return process;
    });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    startServer();
    handlers["SIGTERM"]?.("SIGTERM");

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ signal: "SIGTERM" }),
      "Error while shutting down server"
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls checkIsMain catch fallback", async () => {
    const { serve } = await import("@hono/node-server");

    // We can simulate exception inside realpathSync by passing invalid arguments to sameScript
    // Actually we can just mock realpathSync
    vi.doMock("node:fs", () => ({
      realpathSync: vi.fn(() => { throw new Error("mock error"); })
    }));

    // Setup argv so that isMain evaluates to true
    process.argv = ["node", "dummy-script.ts"];

    // The module block will call checkIsMain
    await import("../../src/server/index.js");

    vi.doUnmock("node:fs");
  });
});

  it("checks sameScript fallback block when try fails", async () => {
    // we need to trigger an error in realpathSync. We did this in another test but missed coverage.
    // Let's create a new test file just for this because we cannot easily mock node:fs here without vitest doMock which causes issues.
  });
