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

  describe("port validation", () => {
    describe.each([
      { portStr: "abc", err: "Invalid PORT value: abc" },
      { portStr: "0", err: "PORT must be between 1 and 65535: 0" },
      { portStr: "70000", err: "PORT must be between 1 and 65535: 70000" },
    ])("rejects $portStr", ({ portStr, err }) => {
      it(`throws "${err}" before starting the server`, async () => {
        const { serve } = await import("@hono/node-server");
        const { startServer } = await import("../../src/server/index.js");

        expect(() => startServer(portStr)).toThrow(err);
        expect(serve).not.toHaveBeenCalled();
      });
    });
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

  describe("shutdown logic", () => {
    let handlers: Record<string, Function>;
    let exitSpy: any;

    beforeEach(async () => {
      handlers = {};
      vi.spyOn(process, "on").mockImplementation((event: string, handler: any) => {
        handlers[event] = handler;
        return process;
      });
      exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    });

    it("exits with failure if server close throws during shutdown", async () => {
      const { serve } = await import("@hono/node-server");
      const { logger } = await import("../../src/core/logger.js");
      const { startServer } = await import("../../src/server/index.js");
      const closeError = new Error("close failed");

      vi.mocked(serve).mockReturnValueOnce({ close: vi.fn(() => { throw closeError; }) } as any);

      startServer();
      handlers["SIGTERM"]?.("SIGTERM");
      handlers["SIGINT"]?.("SIGINT");

      expect(logger.error).toHaveBeenCalledWith(
        { error: closeError, signal: "SIGTERM" },
        "Error while shutting down server",
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("exits with failure if server close throws a string instead of Error", async () => {
      const { serve } = await import("@hono/node-server");
      const { logger } = await import("../../src/core/logger.js");
      const { startServer } = await import("../../src/server/index.js");

      vi.mocked(serve).mockReturnValueOnce({ close: vi.fn(() => { throw "string error"; }) } as any);

      startServer();
      handlers["SIGTERM"]?.("SIGTERM");

      expect(logger.error).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("does not call finish twice if close calls it synchronously", async () => {
      const { serve } = await import("@hono/node-server");
      const { startServer } = await import("../../src/server/index.js");

      vi.mocked(serve).mockReturnValueOnce({ close: vi.fn((cb) => { cb?.(); cb?.(); }) } as any);

      startServer();
      handlers["SIGTERM"]?.("SIGTERM");

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  it("exits with 1 if main script execution throws", async () => {
    const { logger } = await import("../../src/core/logger.js");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    process.argv = ["node", "index.ts"];
    process.env.PORT = "abc"; // Causes startServer to throw

    vi.resetModules();
    await import("../../src/server/index.js");

    expect(logger.error).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
