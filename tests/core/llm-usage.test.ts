import { afterEach, describe, expect, it } from "vitest";
import { recordUsage, withUsage } from "../../src/core/llm-usage.js";

describe("llm usage", () => {
  afterEach(() => {
    delete process.env.LLM_PRICE_IN_PER_M;
    delete process.env.LLM_PRICE_OUT_PER_M;
  });

  it("ignores calls recorded outside a tracked run", () => {
    expect(() => recordUsage({ inputTokens: 5 })).not.toThrow();
  });

  it("sums nested async calls and tolerates missing token counts", async () => {
    const { usage } = await withUsage(async () => {
      recordUsage({ inputTokens: 100, outputTokens: 20 });
      await Promise.resolve();
      recordUsage();
    });
    expect(usage).toEqual({ calls: 2, inputTokens: 100, outputTokens: 20, estimatedCostUsd: undefined });
  });

  it("estimates cost only when both prices are configured", async () => {
    process.env.LLM_PRICE_IN_PER_M = "1";
    const partial = await withUsage(async () => recordUsage({ inputTokens: 1_000_000 }));
    expect(partial.usage.estimatedCostUsd).toBeUndefined();
    process.env.LLM_PRICE_OUT_PER_M = "3";
    const full = await withUsage(async () => recordUsage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }));
    expect(full.usage.estimatedCostUsd).toBe(4);
  });
});
