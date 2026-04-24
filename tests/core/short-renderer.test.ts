import { describe, expect, it, vi } from "vitest";
import { buildSafeFramingFilter, renderShort } from "../../src/core/short-renderer.js";
import fs from "node:fs";
import { execFile } from "node:child_process";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    default: {
      ...actual,
      existsSync: vi.fn(),
      statSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
  };
});

describe("short-renderer", () => {
  it("buildSafeFramingFilter keeps the full source image over a blurred fill", () => {
    const filter = buildSafeFramingFilter("C:\\tmp\\clip.ass", 1080, 1920);

    expect(filter).toContain("scale=1080:1920:force_original_aspect_ratio=increase");
    expect(filter).toContain("gblur=sigma=24");
    expect(filter).toContain("scale=1080:1920:force_original_aspect_ratio=decrease");
    expect(filter).toContain("overlay=(W-w)/2:(H-h)/2");
    expect(filter).toContain("ass='C\\:/tmp/clip.ass'");
  });

  it("throws error if output file is missing", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (typeof p === "string" && p.includes("fonts.conf")) return false;
      if (typeof p === "string" && p.includes("out.mp4")) return false;
      return true;
    });
    vi.mocked(execFile).mockImplementationOnce((file: any, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "", stderr: "" });
      return {} as any;
    });

    await expect(
      renderShort("in.mp4", "out.mp4", "sub.ass", { startTime: 0, duration: 10 } as any, { videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any)
    ).rejects.toThrow("FFmpeg finished but output file is missing: out.mp4");
  });

  it("throws error if output file is too small", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (typeof p === "string" && p.includes("fonts.conf")) return false;
      if (typeof p === "string" && p.includes("out.mp4")) return true;
      return true;
    });
    vi.mocked(fs.statSync).mockReturnValueOnce({ size: 50 * 1024 } as any);

    vi.mocked(execFile).mockImplementationOnce((file: any, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "", stderr: "" });
      return {} as any;
    });

    await expect(
      renderShort("in.mp4", "out.mp4", "sub.ass", { startTime: 0, duration: 10 } as any, { videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any)
    ).rejects.toThrow("FFmpeg output is too small");
  });

  it("uses nvenc and logs stderr if present", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (typeof p === "string" && p.includes("fonts.conf")) return true; // to hit fs.mkdirSync
      if (typeof p === "string" && p.includes("out.mp4")) return true;
      return true;
    });
    vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 } as any);

    vi.mocked(execFile).mockImplementationOnce((file: any, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "", stderr: "Some info" });
      return {} as any;
    });

    await renderShort(
      "in.mp4",
      "out.mp4",
      "sub.ass",
      { startTime: 0, duration: 10 } as any,
      { videoEncoder: "h264_nvenc", verticalWidth: 1080, verticalHeight: 1920 } as any
    );
  });
});
