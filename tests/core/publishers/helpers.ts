import { vi } from "vitest";

export type Route = (url: string, init?: RequestInit) => unknown | Promise<unknown>;

const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

/** Stubs global fetch: the first matching [substring, handler] wins; handlers return a body (or a Response). */
export function stubFetch(routes: Array<[string, Route]>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const route = routes.find(([needle]) => String(url).includes(needle));
    if (!route) throw new Error(`unrouted fetch: ${url}`);
    const result = await route[1](String(url), init);
    return result instanceof Response ? result : json(result);
  }));
  return calls;
}

export const failure = (status: number, body: unknown = { error: "nope" }) => new Response(JSON.stringify(body), { status });
