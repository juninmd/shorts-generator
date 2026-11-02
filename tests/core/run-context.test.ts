import { describe, expect, it, vi } from "vitest";
import { cancelJob, currentSignal, registerJob, runWithSignal, throwIfAborted } from "../../src/core/run-context.js";
import { memorySnapshot } from "../../src/core/memory-monitor.js";
import { logger } from "../../src/core/logger.js";

describe("run context", () => {
  it("scopes the signal to the running job and throws once it is aborted", async () => {
    expect(currentSignal()).toBeUndefined();
    expect(() => throwIfAborted()).not.toThrow();
    const controller = new AbortController();
    await runWithSignal(controller.signal, async () => {
      expect(currentSignal()).toBe(controller.signal);
      expect(() => throwIfAborted()).not.toThrow();
      controller.abort();
      expect(() => throwIfAborted()).toThrow("Job cancelado");
    });
  });

  it("cancels a registered job once and forgets it when done", () => {
    const job = registerJob("j1");
    expect(cancelJob("j1")).toBe(true);
    expect(job.signal.aborted).toBe(true);
    job.done();
    expect(cancelJob("j1")).toBe(false);
  });
});

describe("memory monitor", () => {
  it("reports usage and warns past the threshold", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    expect(memorySnapshot("a").rssMb).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalled();
    process.env.MEMORY_WARN_MB = "1";
    memorySnapshot("b");
    expect(warn).toHaveBeenCalled();
    delete process.env.MEMORY_WARN_MB;
  });
});
