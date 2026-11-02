import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertPublicUrl, isPublicAddress } from "../../src/core/network-policy.js";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));

describe("network policy", () => {
  beforeEach(() => {
    lookup.mockReset();
    delete process.env.ALLOW_PRIVATE_URLS;
  });
  afterEach(() => { delete process.env.ALLOW_PRIVATE_URLS; });

  it.each([
    ["8.8.8.8", true], ["1.1.1.1", true], ["10.0.0.1", false], ["127.0.0.1", false],
    ["169.254.169.254", false], ["172.16.0.1", false], ["172.32.0.1", true], ["192.168.1.1", false],
    ["100.64.0.1", false], ["198.18.0.1", false], ["224.0.0.1", false], ["0.0.0.0", false],
    ["192.0.0.8", false], ["192.0.2.1", true],
    ["::1", false], ["::", false], ["fd00::1", false], ["fe80::1", false], ["ff02::1", false],
    ["::ffff:10.0.0.1", false], ["::ffff:8.8.8.8", true], ["2606:4700::1111", true], ["not-an-ip", false],
  ])("classifies %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });

  it("accepts a URL whose host resolves only to public addresses", async () => {
    lookup.mockResolvedValue([{ address: "142.250.0.1", family: 4 }]);
    expect((await assertPublicUrl("https://www.youtube.com/watch?v=x")).hostname).toBe("www.youtube.com");
    expect((await assertPublicUrl("http://8.8.8.8/x")).hostname).toBe("8.8.8.8");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it.each([
    "not a url", "ftp://example.com/x", "https://user:pw@example.com/x", "http://localhost/x",
    "http://printer.local/x", "http://service.internal/x", "http://127.0.0.1/x", "http://[::1]/x",
    "http://169.254.169.254/latest/meta-data",
  ])("rejects %s", async (url) => {
    lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    await expect(assertPublicUrl(url)).rejects.toThrow("não é pública");
  });

  it("rejects hosts that resolve to a private address or not at all", async () => {
    lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.5", family: 4 }]);
    await expect(assertPublicUrl("https://rebind.example.com")).rejects.toThrow();
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicUrl("https://nxdomain.example.com")).rejects.toThrow();
  });

  it("can be switched off for fully internal deployments", async () => {
    process.env.ALLOW_PRIVATE_URLS = "true";
    expect((await assertPublicUrl("http://10.0.0.1/x")).hostname).toBe("10.0.0.1");
  });
});
