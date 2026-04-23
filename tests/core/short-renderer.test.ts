import { describe, expect, it, vi } from "vitest";
import { buildSafeFramingFilter } from "../../src/core/short-renderer.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

describe("short-renderer", () => {
  it("buildSafeFramingFilter keeps the full source image over a blurred fill", () => {
    const filter = buildSafeFramingFilter("C:\\tmp\\clip.ass", 1080, 1920);

    expect(filter).toContain("scale=1080:1920:force_original_aspect_ratio=increase");
    expect(filter).toContain("gblur=sigma=24");
    expect(filter).toContain("scale=1080:1920:force_original_aspect_ratio=decrease");
    expect(filter).toContain("overlay=(W-w)/2:(H-h)/2");
    expect(filter).toContain("ass='C\\:/tmp/clip.ass'");
  });
  it("verifyOutput throws when output is too small", async () => {
    // we need to dynamically import the module so we can test the internal verifyOutput
    const { renderShort } = await import("../../src/core/short-renderer.js");
    const fs = await import("node:fs");
    const childProcess = await import("node:child_process");

    const execFileMock = vi.mocked(childProcess.execFile);
    execFileMock.mockImplementation((file: any, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "", stderr: "" });
      return {} as any;
    });

    const mockFs = vi.mocked(fs.default);
    mockFs.existsSync.mockReturnValue(true);
    // return small size
    mockFs.statSync.mockReturnValue({ size: 50 * 1024 } as any);

    const config = {
      verticalWidth: 1080,
      verticalHeight: 1920,
      videoEncoder: "libx264",
    } as any;
    const clip = {
      startTime: 0,
      duration: 10,
    } as any;

    await expect(
      renderShort("input", "output", "ass", clip, config)
    ).rejects.toThrow(/FFmpeg output is too small/);
  });

  it("verifyOutput throws when output file is missing", async () => {
    const { renderShort } = await import("../../src/core/short-renderer.js");
    const fs = await import("node:fs");
    const childProcess = await import("node:child_process");

    const execFileMock = vi.mocked(childProcess.execFile);
    execFileMock.mockImplementation((file: any, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "", stderr: "" });
      return {} as any;
    });

    const mockFs = vi.mocked(fs.default);
    mockFs.existsSync.mockReturnValue(false);

    const config = {
      verticalWidth: 1080,
      verticalHeight: 1920,
      videoEncoder: "libx264",
    } as any;
    const clip = {
      startTime: 0,
      duration: 10,
    } as any;

    await expect(
      renderShort("input", "output", "ass", clip, config)
    ).rejects.toThrow(/output file is missing/);
  });

  it("renderShort uses nvenc settings", async () => {
    const { renderShort } = await import("../../src/core/short-renderer.js");
    const fs = await import("node:fs");
    const childProcess = await import("node:child_process");

    const execFileMock = vi.mocked(childProcess.execFile);
    let capturedArgs: any[] = [];
    execFileMock.mockImplementation((file: any, args: any, options: any, callback?: any) => {
      capturedArgs = args;
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "", stderr: "info" });
      return {} as any;
    });

    const mockFs = vi.mocked(fs.default);
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 150 * 1024 } as any);

    const config = {
      verticalWidth: 1080,
      verticalHeight: 1920,
      videoEncoder: "hevc_nvenc",
    } as any;
    const clip = {
      startTime: 0,
      duration: 10,
    } as any;

    await renderShort("input", "output", "ass", clip, config);
    expect(capturedArgs).toContain("-cq");
    expect(capturedArgs).toContain("p4");
  });
});
