import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../../src/core/retry-backoff.js";

vi.mock("../../src/core/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

describe("withRetry", () => {
  it("returns result on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { maxAttempts: 3 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should cover isQuotaOrAuthError falsy fallback branch", async () => {
    // Pass something that is not an Error instance to cover the first branch
    const fn = vi.fn().mockRejectedValue("string error");
    await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toEqual("string error");
  });

  it("should handle error without message properly via ??", async () => {
    const err = new Error();
    Object.defineProperty(err, "message", { get: () => undefined });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow();
  });

  it("should cover missing lastError throw", async () => {
    // maxAttempts is 0, so loop doesn't run, throws lastError (undefined)
    const fn = vi.fn().mockResolvedValue(true);
    await expect(withRetry(fn, { maxAttempts: 0 })).rejects.toBeUndefined();
  });

  it("should cover fallback error loop condition", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(withRetry(fn, { maxAttempts: 0 })).rejects.toBeUndefined();
  });

  it("should handle Error with undefined message", async () => {
    const err = new Error();
    Object.defineProperty(err, "message", { value: undefined });
    const mockFn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(mockFn, { maxAttempts: 1 })).rejects.toThrow();
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

  it("handles Error instances with missing message", async () => {
    const error = new Error("temporary");
    Object.defineProperty(error, "message", { value: undefined });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 1 })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry when shouldRetry returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("skip me"));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow("skip me");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
