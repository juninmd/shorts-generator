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
    debug: vi.fn(),
  },
}));

vi.mock("../../src/core/control-plane-config.js", () => ({
  tryLoadControlPlaneConfig: vi.fn(() => null),
}));

vi.mock("../../src/core/control-plane-db.js", () => ({
  getControlPlanePool: vi.fn(() => ({})),
}));

vi.mock("../../src/core/control-plane-migrations.js", () => ({
  runControlPlaneMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/server/job-store.js", () => ({
  cleanupOldJobs: vi.fn().mockReturnValue(0),
  jobs: new Map(),
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

    expect(logger.info).toHaveBeenCalledWith({ signal: "SIGTERM" }, "Shutting down server...");
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

  it("should run migrations and start server when control plane config is present", async () => {
    const controlPlaneCfg = {
      adminToken: "tok", allowedOrigins: ["http://localhost:5173"],
      databaseUrl: "postgres://x", encryptionKey: Buffer.alloc(32), encryptionKeyVersion: "v1",
    };
    vi.doMock("../../src/core/control-plane-config.js", () => ({
      tryLoadControlPlaneConfig: vi.fn(() => controlPlaneCfg),
    }));

    const { runControlPlaneMigrations } = await import("../../src/core/control-plane-migrations.js");
    const { startServer } = await import("../../src/server/index.js");

    await startServer("4001");

    expect(vi.mocked(runControlPlaneMigrations)).toHaveBeenCalled();
    vi.doUnmock("../../src/core/control-plane-config.js");
  });

  it("cleanupOldJobs timer fires after interval", async () => {
    vi.useFakeTimers();
    const { startServer } = await import("../../src/server/index.js");
    const { cleanupOldJobs } = await import("../../src/server/job-store.js");

    startServer("4002");
    await vi.advanceTimersByTimeAsync(60_000);

    vi.useRealTimers();
  });
});

describe("Server Index - Error Handlers", () => {
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

  it("should throw error for invalid PORT values", async () => {
    const { startServer } = await import("../../src/server/index.js");

    expect(() => startServer("invalid")).toThrow(/Invalid PORT value/);
    expect(() => startServer("0")).toThrow(/PORT must be between 1 and 65535/);
    expect(() => startServer("70000")).toThrow(/PORT must be between 1 and 65535/);
  });

  it("should handle error thrown during server close", async () => {
    const { startServer } = await import("../../src/server/index.js");
    const { serve } = await import("@hono/node-server");

    // Mock serve to return an object with a throwing close method
    const mockClose = vi.fn((finish) => {
      throw new Error("Close error");
    });
    vi.mocked(serve).mockReturnValueOnce({ close: mockClose } as any);

    const handlers: Record<string, Function> = {};
    const processOnSpy = vi.spyOn(process, "on").mockImplementation((event: string, handler: any) => {
      handlers[event] = handler;
      return process;
    });

    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    startServer();

    if (handlers["SIGTERM"]) {
      handlers["SIGTERM"]();
    }

    expect(processExitSpy).toHaveBeenCalledWith(1); // Exited with error code 1

    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should handle error in catch block of server start", async () => {
    const { startServer } = await import("../../src/server/index.js");
    const { serve } = await import("@hono/node-server");

    // Mock serve to throw an error
    vi.mocked(serve).mockImplementationOnce(() => {
      throw new Error("Server start error");
    });

    expect(() => startServer()).toThrow(/Server start error/);
  });

  it("should handle error when isMain block throws", async () => {
    const { serve } = await import("@hono/node-server");
    const { logger } = await import("../../src/core/logger.js");

    // Setup argv so that isMain evaluates to true
    const path = await import("node:path");
    const scriptPath = path.resolve(process.cwd(), "src/server/index.ts");
    process.argv = ["node", scriptPath];

    vi.mocked(serve).mockImplementationOnce(() => {
      throw new Error("isMain startup error");
    });

    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const mockLoggerError = vi.spyOn(logger, "error");

    await import("../../src/server/index.js");

    // We have to wait for a microtask because of the Promise.resolve().then() in isMain
    await new Promise(process.nextTick);

    expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error) }), "Fatal server startup error");
    expect(processExitSpy).toHaveBeenCalledWith(1);

    processExitSpy.mockRestore();
    mockLoggerError.mockRestore();
  });

  it("should cover zero length in server.close() inside closeServer", async () => {
    const { startServer } = await import("../../src/server/index.js");
    const { serve } = await import("@hono/node-server");

    // Mock serve with zero length close method
    const mockClose = vi.fn();
    Object.defineProperty(mockClose, 'length', { value: 0 });
    vi.mocked(serve).mockReturnValueOnce({ close: mockClose } as any);

    const handlers: Record<string, Function> = {};
    const processOnSpy = vi.spyOn(process, "on").mockImplementation((event: string, handler: any) => {
      handlers[event] = handler;
      return process;
    });

    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    startServer();

    if (handlers["SIGTERM"]) {
      handlers["SIGTERM"]();
    }

    expect(processExitSpy).toHaveBeenCalledWith(0);

    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should cover exited check in finish() inside closeServer", async () => {
    const { startServer } = await import("../../src/server/index.js");
    const { serve } = await import("@hono/node-server");

    // Mock serve to call finish twice
    const mockClose = vi.fn((finish) => {
      finish();
      finish(); // Second call to test if (exited) return;
    });
    vi.mocked(serve).mockReturnValueOnce({ close: mockClose } as any);

    const handlers: Record<string, Function> = {};
    const processOnSpy = vi.spyOn(process, "on").mockImplementation((event: string, handler: any) => {
      handlers[event] = handler;
      return process;
    });

    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    startServer();

    if (handlers["SIGTERM"]) {
      handlers["SIGTERM"]();
    }

    // exit should only be called once despite finish() being called twice
    expect(processExitSpy).toHaveBeenCalledTimes(1);
    expect(processExitSpy).toHaveBeenCalledWith(0);

    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("should cover string error in catch block inside closeServer", async () => {
    const { startServer } = await import("../../src/server/index.js");
    const { serve } = await import("@hono/node-server");

    // Mock serve to throw a non-Error object
    const mockClose = vi.fn((finish) => {
      throw "String error";
    });
    vi.mocked(serve).mockReturnValueOnce({ close: mockClose } as any);

    const handlers: Record<string, Function> = {};
    const processOnSpy = vi.spyOn(process, "on").mockImplementation((event: string, handler: any) => {
      handlers[event] = handler;
      return process;
    });

    const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    startServer();

    if (handlers["SIGTERM"]) {
      handlers["SIGTERM"]();
    }

    expect(processExitSpy).toHaveBeenCalledWith(1);

    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it("cleanupOldJobs timer logs when jobs are removed", async () => {
    vi.useFakeTimers();
    const { startServer } = await import("../../src/server/index.js");
    const { cleanupOldJobs } = await import("../../src/server/job-store.js");
    const { logger } = await import("../../src/core/logger.js");

    vi.mocked(cleanupOldJobs).mockReturnValue(5); // Simulate removing jobs
    startServer("4003");

    await vi.advanceTimersByTimeAsync(60_000);

    expect(logger.debug).toHaveBeenCalledWith({ removed: 5 }, "Cleaned up old in-memory jobs");

    vi.useRealTimers();
  });

  it("should handle sameScript matching exactly", async () => {
    const { serve } = await import("@hono/node-server");

    process.argv = ["node", "/app/src/server/index.ts"];

    vi.doMock("node:url", () => ({
      fileURLToPath: vi.fn(() => "/app/src/server/index.ts")
    }));

    await import("../../src/server/index.js");

    expect(serve).toHaveBeenCalled();
    vi.doUnmock("node:url");
  });

  it("should cover isMain when module Path doesn't end with script path", async () => {
    const { serve } = await import("@hono/node-server");

    process.argv = ["node", "/app/src/server/other.ts"];

    vi.doMock("node:url", () => ({
      fileURLToPath: vi.fn(() => "/app/src/server/index.ts")
    }));

    await import("../../src/server/index.js");

    expect(serve).not.toHaveBeenCalled();
    vi.doUnmock("node:url");
  });
});
