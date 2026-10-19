import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { pollIntervalMs, pollUntilDone, requestJson } from "../../../src/core/publishers/http.js";
import { failure, stubFetch } from "./helpers.js";

describe("requestJson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses JSON, tolerates empty bodies and reports failures with the response body", async () => {
    stubFetch([["/ok", () => ({ a: 1 })], ["/empty", () => new Response("", { status: 200 })], ["/bad", () => failure(400, { error: "boom" })]]);
    expect(await requestJson("T", "https://x/ok")).toEqual({ a: 1 });
    expect(await requestJson("T", "https://x/empty")).toEqual({});
    await expect(requestJson("Thing", "https://x/bad")).rejects.toThrow('Thing failed (400): {"error":"boom"}');
  });
});

describe("pollUntilDone", () => {
  beforeEach(() => {
    process.env.PUBLISH_POLL_MS = "1";
    process.env.PUBLISH_POLL_ATTEMPTS = "3";
  });
  afterEach(() => { delete process.env.PUBLISH_POLL_MS; delete process.env.PUBLISH_POLL_ATTEMPTS; });

  it("resolves once the check reports done", async () => {
    const check = vi.fn().mockResolvedValueOnce("pending").mockResolvedValueOnce("done");
    await pollUntilDone("V", check);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("rejects on failure and on timeout", async () => {
    await expect(pollUntilDone("V", async () => "failed")).rejects.toThrow("V processing failed");
    const never = vi.fn().mockResolvedValue("pending");
    await expect(pollUntilDone("V", never)).rejects.toThrow("V timed out");
    expect(never).toHaveBeenCalledTimes(3);
  });

  it("defaults to 5s between polls and 60 attempts", async () => {
    delete process.env.PUBLISH_POLL_MS;
    delete process.env.PUBLISH_POLL_ATTEMPTS;
    expect(pollIntervalMs()).toBe(5000);
    await pollUntilDone("V", async () => "done");
  });
});
