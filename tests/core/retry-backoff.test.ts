import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/core/retry-backoff.js";

vi.mock("../../src/core/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

describe("withRetry", () => {
  it("returns result on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { maxAttempts: 3 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error and succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue("ok");
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("transient"));
    await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 1 })).rejects.toThrow("transient");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry quota errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("quotaExceeded: daily limit"));
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow("quotaExceeded");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("skip me"));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow("skip me");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
