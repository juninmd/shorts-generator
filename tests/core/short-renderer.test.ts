import { describe, expect, it, vi, beforeEach } from "vitest";
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildSafeFramingFilter fills the screen with zoomed crop and lanczos scaling", () => {
    const filter = buildSafeFramingFilter("C:\\tmp\\clip.ass", 1080, 1920);

    expect(filter).toContain("scale=w='if(gt(iw/ih,1080/1920),-1,1080)':h='if(gt(iw/ih,1080/1920),1920,-1)':flags=lanczos+accurate_rnd");
    expect(filter).toContain("hqdn3d=1.5:1.5:3:3");
    expect(filter).toContain("unsharp=3:3:0.5:3:3:0.5");
    expect(filter).toContain("crop=1080:1920");
    expect(filter).toContain("ass='C\\:/tmp/clip.ass'");
  });

  it("buildSafeFramingFilter applies the breathing punch-in before subtitles", () => {
    const filter = buildSafeFramingFilter("C:\\tmp\\clip.ass", 1080, 1920);
    const punchIn = filter.indexOf("pow(sin(PI*t/8),2)");
    expect(punchIn).toBeGreaterThan(-1);
    expect(filter).toContain("eval=frame");
    // zoom happens before the subtitle burn so caption text stays fixed
    expect(punchIn).toBeLessThan(filter.indexOf("ass='"));
  });

  it("buildSafeFramingFilter centers the crop by default", () => {
    const filter = buildSafeFramingFilter("clip.ass", 1080, 1920);
    expect(filter).toContain("crop=1080:1920:'clip((in_w*0.5000)-(1080/2)");
    expect(filter).toContain(":(in_h-1920)/2,");
  });

  it("buildSafeFramingFilter biases the crop toward the detected speaker", () => {
    const filter = buildSafeFramingFilter("clip.ass", 1080, 1920, null, 0.75);
    expect(filter).toContain("crop=1080:1920:'clip((in_w*0.7500)-(1080/2)");
  });

  it("buildSafeFramingFilter clamps the focus into [0,1]", () => {
    expect(buildSafeFramingFilter("clip.ass", 1080, 1920, null, 2)).toContain("in_w*1.0000");
    expect(buildSafeFramingFilter("clip.ass", 1080, 1920, null, -1)).toContain("in_w*0.0000");
  });

  it("buildSafeFramingFilter includes logo overlay when logoPath is provided", () => {
    const filter = buildSafeFramingFilter("C:\\tmp\\clip.ass", 1080, 1920, "/logos/wm.png");
    expect(filter).toContain("[1:v]scale=180:-1[logo]");
    expect(filter).toContain("[base][logo]overlay=W-w-36:36[v]");
  });

  describe("renderShort validation", () => {
    beforeEach(() => {
      vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
        const cb = callback || options || args;
        if (typeof cb === "function") cb(null, { stdout: "", stderr: "" });
        return {} as any;
      });
    });

    const callRenderShort = () => renderShort(
      "in.mp4", "out.mp4", "sub.ass",
      { startTime: 0, duration: 10 } as any,
      { videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any
    );

    it("throws error if output file is missing", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes("fonts.conf")) return false;
        if (typeof p === "string" && p.includes("out.mp4")) return false;
        return true;
      });

      await expect(callRenderShort()).rejects.toThrow("FFmpeg finished but output file is missing: out.mp4");
    });

    it("throws error if output file is too small", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes("fonts.conf")) return false;
        if (typeof p === "string" && p.includes("out.mp4")) return true;
        return true;
      });
      vi.mocked(fs.statSync).mockReturnValue({ size: 50 * 1024 } as any);

      await expect(callRenderShort()).rejects.toThrow("FFmpeg output is too small");
    });

    it("uses nvenc and logs stderr if present", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes("fonts.conf")) return true;
        if (typeof p === "string" && p.includes("out.mp4")) return true;
        return true;
      });
      vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 } as any);

      vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
        const cb = callback || options || args;
        if (typeof cb === "function") cb(null, { stdout: "", stderr: "Some info" });
        return {} as any;
      });

      await renderShort(
        "in.mp4", "out.mp4", "sub.ass",
        { startTime: 0, duration: 10 } as any,
        { videoEncoder: "h264_nvenc", verticalWidth: 1080, verticalHeight: 1920 } as any
      );
    });
  });
});
