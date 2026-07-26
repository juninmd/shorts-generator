import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleAbort } from "../../src/core/abort-timeout.js";

describe("abort timeout", () => {
  afterEach(() => vi.useRealTimers());

  it("aborts the controller after the configured delay", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();

    scheduleAbort(controller, 25);
    await vi.advanceTimersByTimeAsync(25);

    expect(controller.signal.aborted).toBe(true);
  });
});
