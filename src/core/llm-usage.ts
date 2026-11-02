import { AsyncLocalStorage } from "node:async_hooks";

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Labeled estimate from LLM_PRICE_IN_PER_M / LLM_PRICE_OUT_PER_M (USD per million tokens); absent when unset. */
  estimatedCostUsd?: number;
}

const store = new AsyncLocalStorage<UsageTotals>();

export function recordUsage(usage?: { inputTokens?: number; outputTokens?: number }): void {
  const totals = store.getStore();
  if (!totals) return;
  totals.calls += 1;
  totals.inputTokens += usage?.inputTokens ?? 0;
  totals.outputTokens += usage?.outputTokens ?? 0;
}

function estimate(totals: UsageTotals): number | undefined {
  const input = Number(process.env.LLM_PRICE_IN_PER_M);
  const output = Number(process.env.LLM_PRICE_OUT_PER_M);
  if (!(input >= 0) || !(output >= 0) || !process.env.LLM_PRICE_IN_PER_M || !process.env.LLM_PRICE_OUT_PER_M) return undefined;
  return (totals.inputTokens * input + totals.outputTokens * output) / 1_000_000;
}

/** Runs fn collecting every LLM call made inside it (including nested async work). */
export async function withUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage: UsageTotals }> {
  const totals: UsageTotals = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const result = await store.run(totals, fn);
  return { result, usage: { ...totals, estimatedCostUsd: estimate(totals) } };
}
