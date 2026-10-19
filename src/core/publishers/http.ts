/** fetch + JSON with a readable error that includes the platform's response body. */
export async function requestJson<T = any>(label: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export const pollIntervalMs = (): number => Number.parseInt(process.env.PUBLISH_POLL_MS ?? "", 10) || 5000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls `check` until it reports "done" (resolve) or "failed" (reject); anything
 * else keeps waiting, up to PUBLISH_POLL_ATTEMPTS (default 60) tries.
 */
export async function pollUntilDone(
  label: string,
  check: () => Promise<"done" | "failed" | "pending">,
): Promise<void> {
  const attempts = Number.parseInt(process.env.PUBLISH_POLL_ATTEMPTS ?? "", 10) || 60;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const state = await check();
    if (state === "done") return;
    if (state === "failed") throw new Error(`${label} processing failed`);
    await sleep(pollIntervalMs());
  }
  throw new Error(`${label} timed out waiting for processing`);
}
