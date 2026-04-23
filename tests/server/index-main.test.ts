import { describe, it, expect, vi } from "vitest";

describe("Server Index checkIsMain fallback", () => {
  it("uses sameScript fallback when realpathSync throws", async () => {
    vi.doMock("node:fs", () => ({
      realpathSync: vi.fn(() => { throw new Error("mock error"); })
    }));

    vi.doMock("@hono/node-server", () => ({ serve: vi.fn() }));
    vi.doMock("dotenv", () => ({ config: vi.fn() }));
    vi.doMock("../../src/core/logger.js", () => ({
      logger: { info: vi.fn(), error: vi.fn() },
    }));

    process.argv = ["node", "dummy-script.ts"];
    vi.doMock("node:url", () => ({ fileURLToPath: () => "dummy-script.ts" }));

    // We import it, which will execute the isMain block
    await import("../../src/server/index.js");

    vi.doUnmock("node:fs");
    vi.doUnmock("node:url");
  });

  it("handles fatal startup error", async () => {
    vi.doMock("node:fs", () => ({
      realpathSync: vi.fn((path) => path)
    }));

    vi.doMock("@hono/node-server", () => ({ serve: vi.fn() }));
    vi.doMock("dotenv", () => ({ config: vi.fn() }));

    const mockErrorFn = vi.fn();
    vi.doMock("../../src/core/logger.js", () => ({
      logger: { info: vi.fn(), error: mockErrorFn },
    }));

    process.argv = ["node", "dummy-script.ts"];
    vi.doMock("node:url", () => ({ fileURLToPath: () => "dummy-script.ts" }));

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    vi.doMock("../../src/server/index.js", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../../src/server/index.js")>();
      // mock startServer to throw
      const error = new Error("fatal error");
      return {
        ...mod,
        startServer: () => { throw error; }
      };
    });

    process.env.PORT = "abc";

    try {
      await import("../../src/server/index.js?fatal");
    } catch {}

    expect(mockErrorFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Fatal server startup error"
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    vi.doUnmock("node:fs");
    vi.doUnmock("node:url");
    vi.doUnmock("../../src/server/index.js");
  });
});
