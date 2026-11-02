import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<AbortSignal>();
const jobs = new Map<string, AbortController>();

/** Runs fn so every ffmpeg job and pipeline step inside it can be cancelled through `signal`. */
export const runWithSignal = <T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> => store.run(signal, fn);

export const currentSignal = (): AbortSignal | undefined => store.getStore();

export function throwIfAborted(): void {
  if (store.getStore()?.aborted) throw new Error("Job cancelado");
}

/** Registers a cancellable job; call the returned function when it ends. */
export function registerJob(jobId: string): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  jobs.set(jobId, controller);
  return { signal: controller.signal, done: () => void jobs.delete(jobId) };
}

export function cancelJob(jobId: string): boolean {
  const controller = jobs.get(jobId);
  controller?.abort();
  return controller !== undefined;
}
