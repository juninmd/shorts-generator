import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the module
vi.mock("@hono/node-server", () => ({
  serve: vi.fn((_options, callback) => {
    // Simulate the server starting and calling the callback
    if (callback) {
      callback({ port: 3001 });
    }
    return { close: vi.fn() };
  }),
}));

vi.mock("dotenv", () => ({
  config: vi.fn(),
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Server Index", () => {
  let originalArgv: string[];
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalArgv = process.argv;
    originalEnv = { ...process.env };
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
  });

  it("should start the server when startServer is called", async () => {
    const { serve } = await import("@hono/node-server");
    const { logger } = await import("../../src/core/logger.js");
    const { startServer } = await import("../../src/server/index.js");

    process.env.PORT = "4000";
    startServer();

    expect(serve).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ port: 4000 }, "Starting Shorts Generator API server");
    expect(logger.info).toHaveBeenCalledWith("Server running at http://localhost:3001");
  });

  it("should use port 3001 if PORT env is not set", async () => {
    const { serve } = await import("@hono/node-server");
    const { logger } = await import("../../src/core/logger.js");
    const { startServer } = await import("../../src/server/index.js");

    delete process.env.PORT;
    startServer();

    expect(serve).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ port: 3001 }, "Starting Shorts Generator API server");
  });

  it("should execute startServer if file is run directly", async () => {
    const { serve } = await import("@hono/node-server");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    // Setup argv so that isMain evaluates to true
    const scriptPath = path.resolve(process.cwd(), "src/server/index.ts");
    process.argv = ["node", scriptPath];

    // We import it, which will execute the isMain block
    await import("../../src/server/index.js");

    expect(serve).toHaveBeenCalled();
  });

  it("should handle graceful shutdown on SIGTERM and SIGINT", async () => {
    const { startServer } = await import("../../src/server/index.js");
    const { serve } = await import("@hono/node-server");
    const { logger } = await import("../../src/core/logger.js");

    const mockClose = vi.fn();
    vi.mocked(serve).mockReturnValueOnce({ close: mockClose } as any);

    // Mock process.on to capture signal handlers
    const handlers: Record<string, Function> = {};
    const processOnSpy = vi.spyOn(process, "on").mockImplementation((event: string, handler: any) => {
      handlers[event] = handler;
      return process;
    });

    // Mock process.exit to avoid exiting test suite
    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    startServer();

    // Call the captured handler for SIGTERM
    if (handlers["SIGTERM"]) {
      handlers["SIGTERM"]();
    }

    expect(logger.info).toHaveBeenCalledWith("Shutting down server...");
    expect(mockClose).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(0);

    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should handle error in isMain check via fallback", async () => {
    const { serve } = await import("@hono/node-server");

    // Mock the fs module using vitest doMock to ensure realpathSync throws
    vi.doMock("node:fs", () => ({
      realpathSync: vi.fn(() => {
        throw new Error("mock error");
      }),
    }));

    process.argv = ["node", "src/server/index.ts"];

    // The catch block in checkIsMain uses fileURLToPath which should return true
    await import("../../src/server/index.js");

    expect(serve).toHaveBeenCalled();
    vi.doUnmock("node:fs");
  });

  it("should return false if process.argv[1] is undefined", async () => {
    const { serve } = await import("@hono/node-server");

    process.argv = ["node"]; // Missing argv[1]

    await import("../../src/server/index.js");

    // Since startServer shouldn't be called, serve shouldn't be called
    expect(serve).not.toHaveBeenCalled();
  });
});
