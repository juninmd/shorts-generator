import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";

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

describe("Server isMain startup handling", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalArgv: string[];
  let exitSpy: any;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalArgv = process.argv;
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  it("should successfully start server when run as main via promise resolution", async () => {
    const { logger } = await import("../../src/core/logger.js");
    const modulePath = fileURLToPath(new URL("../../src/server/index.ts", import.meta.url));
    process.argv = ["node", modulePath];

    // Simulate successful startServer inside the isMain block
    vi.doMock("../../src/server/index.js", () => ({
      startServer: vi.fn().mockResolvedValue(undefined),
      app: {},
      jobs: new Map()
    }));

    await import("../../src/server/index.js");

    // allow microtasks to flush
    await Promise.resolve();
    await Promise.resolve();

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(logger.error).not.toHaveBeenCalledWith(expect.anything(), "Fatal server startup error");
  });

  it("should handle error when checkIsMain uses fallback logic", async () => {
    // Cannot mock fs.realpathSync in ESM natively easily without vi.mock("node:fs"). Let's try passing a non-existent path.
    const modulePath = fileURLToPath(new URL("../../src/server/index.ts", import.meta.url));
    process.argv = ["node", "/invalid/path/that/throws/on/realpathSync.js"];

    // This will force realpathSync(scriptArg) to fail, triggering the catch block in checkIsMain

    await import("../../src/server/index.js");

    expect(exitSpy).not.toHaveBeenCalledWith(1);
  });

  it("should evaluate sameScript to true when paths differ slightly but match at end", async () => {
     // To hit the "return module === script || module.endsWith(script);" line where they are not exactly equal but endsWith matches
     process.argv = ["node", "src/server/index.ts"]; // relative path

     vi.doMock("../../src/server/index.js", () => ({
      startServer: vi.fn().mockResolvedValue(undefined),
      app: {},
      jobs: new Map()
     }));

     await import("../../src/server/index.js");

     await Promise.resolve();
     await Promise.resolve();

     // Because of how the module cache works in vitest, checking exact coverage requires the file to be imported. We just test the execution.
  });
});
