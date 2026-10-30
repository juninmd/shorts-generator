import { describe, expect, it, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import {
  buildTonemapFilter,
  hasTonemapFilters,
  isHdrTransfer,
  resetTonemapCache,
  supportsTonemap,
} from "../../src/core/hdr-tonemap.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

const listing = " TSC zscale            V->V       Apply zscale filter.\n .S. tonemap           V->V       Tone map.";
const noZscale = " .S. tonemap           V->V       Tone map.";

function mockListing(stdout: string) {
  vi.mocked(execFile).mockImplementation(((...args: any[]) => {
    args.at(-1)(null, { stdout, stderr: "" });
    return {} as any;
  }) as any);
}

describe("HDR tone mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTonemapCache();
  });

  it("recognises the PQ and HLG transfers", () => {
    expect(isHdrTransfer("smpte2084")).toBe(true);
    expect(isHdrTransfer("ARIB-STD-B67")).toBe(true);
    expect(isHdrTransfer("bt709")).toBe(false);
    expect(isHdrTransfer("")).toBe(false);
    expect(isHdrTransfer(undefined)).toBe(false);
  });

  it("builds a linear-light tone map to SDR BT.709", () => {
    const filter = buildTonemapFilter();
    expect(filter).toContain("zscale=t=linear:npl=100");
    expect(filter).toContain("tonemap=tonemap=hable:desat=0");
    expect(filter).toContain("format=yuv420p,");
  });

  it("needs both zscale and tonemap in the filter listing", () => {
    expect(hasTonemapFilters(listing)).toBe(true);
    expect(hasTonemapFilters(noZscale)).toBe(false);
    expect(hasTonemapFilters("")).toBe(false);
  });

  it("detects the capability once per process", async () => {
    mockListing(listing);
    await expect(supportsTonemap()).resolves.toBe(true);
    await expect(supportsTonemap()).resolves.toBe(true);
    expect(execFile).toHaveBeenCalledTimes(1);
    resetTonemapCache();
    await expect(supportsTonemap()).resolves.toBe(true);
    expect(execFile).toHaveBeenCalledTimes(2);
  });

  it("reports a build without the filters and remembers that answer", async () => {
    mockListing(noZscale);
    await expect(supportsTonemap()).resolves.toBe(false);
    await expect(supportsTonemap()).resolves.toBe(false);
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed listing, so a transient failure is retried", async () => {
    vi.mocked(execFile).mockImplementation(((...args: any[]) => {
      args.at(-1)(new Error("ffmpeg not found"));
      return {} as any;
    }) as any);
    await expect(supportsTonemap()).resolves.toBe(false);
    await expect(supportsTonemap()).resolves.toBe(false);
    expect(execFile).toHaveBeenCalledTimes(2);
  });
});
