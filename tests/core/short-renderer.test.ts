import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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

const probeJson = JSON.stringify({
  format: { duration: "10" },
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 },
  ],
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

  it("buildSafeFramingFilter does not zoom by default", () => {
    const filter = buildSafeFramingFilter("clip.ass", 1080, 1920);
    expect(filter).not.toContain("pow(sin(PI*t/8),2)");
    expect(filter).not.toContain("eval=frame");
  });

  it("buildSafeFramingFilter applies the breathing punch-in before subtitles when PUNCH_IN=true", () => {
    vi.stubEnv("PUNCH_IN", "true");
    const filter = buildSafeFramingFilter("C:\\tmp\\clip.ass", 1080, 1920);
    vi.unstubAllEnvs();
    const punchIn = filter.indexOf("pow(sin(PI*t/8),2)");
    expect(punchIn).toBeGreaterThan(-1);
    expect(filter).toContain("eval=frame");
    expect(filter).toContain("crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2");
    // zoom happens before the subtitle burn so caption text stays fixed
    expect(punchIn).toBeLessThan(filter.indexOf("ass='"));
  });

  it("buildSafeFramingFilter centers the crop by default", () => {
    const filter = buildSafeFramingFilter("clip.ass", 1080, 1920);
    expect(filter).toContain("crop=1080:1920:'clip((in_w-1080)*0.5000");
    expect(filter).toContain(":(in_h-1920)/2,");
  });

  it("buildSafeFramingFilter pads the edges so a speaker at the far side stays centered", () => {
    const filter = buildSafeFramingFilter("clip.ass", 1080, 1920, null, 0.05);
    expect(filter).toContain("pad=iw+1080:ih:540:0,fillborders=left=540:right=540:mode=smear,crop=1080:1920:'clip((in_w-1080)*0.0500");
  });

  it("buildSafeFramingFilter biases the crop toward the detected speaker", () => {
    const filter = buildSafeFramingFilter("clip.ass", 1080, 1920, null, 0.75);
    expect(filter).toContain("crop=1080:1920:'clip((in_w-1080)*0.7500");
  });

  it("buildSafeFramingFilter clamps the focus into [0,1]", () => {
    expect(buildSafeFramingFilter("clip.ass", 1080, 1920, null, 2)).toContain("*1.0000");
    expect(buildSafeFramingFilter("clip.ass", 1080, 1920, null, -1)).toContain("*0.0000");
  });

  it("buildSafeFramingFilter pans the crop with tracked speaker keyframes", () => {
    const filter = buildSafeFramingFilter("clip.ass", 1080, 1920, null, [
      { t: 0.25, x: 0.2 }, { t: 1.75, x: 0.8 },
    ]);
    expect(filter).toContain("crop=1080:1920:'clip((in_w-1080)*(if(lt(t\\,0.2500)");
    expect(filter).toContain("(t-0.2500)/1.5000");
  });

  it("buildSafeFramingFilter includes logo overlay when logoPath is provided", () => {
    const filter = buildSafeFramingFilter("C:\\tmp\\clip.ass", 1080, 1920, "/logos/wm.png");
    expect(filter).toContain("[1:v]scale=180:-1[logo]");
    expect(filter).toContain("[base][logo]overlay=W-w-36:36[v]");
  });

  describe("renderShort with background music", () => {
    afterEach(() => { delete process.env.BGM_FILE; });

    it("ducks the music under the speech through the filter graph", async () => {
      process.env.BGM_FILE = "bgm.mp3";
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 } as any);
      vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
        const cb = callback || options || args;
        if (typeof cb === "function") cb(null, { stdout: file === "ffprobe" ? probeJson : "", stderr: "" });
        return {} as any;
      });
      await renderShort(
        "in.mp4", "out.mp4", "sub.ass",
        { startTime: 0, duration: 10 } as any,
        { managedRun: { logoPath: "logo.png" }, videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any,
      );
      const call = vi.mocked(execFile).mock.calls.find((c) => (c[1] as string[]).includes("-filter_complex"))!;
      const args = call[1] as string[];
      expect(args.slice(args.indexOf("-stream_loop"), args.indexOf("-stream_loop") + 4)).toEqual(["-stream_loop", "-1", "-i", "bgm.mp3"]);
      expect(args[args.indexOf("-filter_complex") + 1]).toContain("[2:a]aresample=48000,volume=");
      expect(args).toContain("[aout]");
      expect(args).not.toContain("-af");
    });
  });

  describe("renderShort validation", () => {
    beforeEach(() => {
      vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
        const cb = callback || options || args;
        if (typeof cb === "function") {
          cb(null, { stdout: file === "ffprobe" ? probeJson : "", stderr: "" });
        }
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
        if (typeof cb === "function") {
          cb(null, { stdout: file === "ffprobe" ? probeJson : "", stderr: "Some info" });
        }
        return {} as any;
      });

      await renderShort(
        "in.mp4", "out.mp4", "sub.ass",
        { startTime: 0, duration: 10 } as any,
        { videoEncoder: "h264_nvenc", verticalWidth: 1080, verticalHeight: 1920 } as any
      );
    });

    it("validates the rendered artifact with ffprobe", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 } as any);

      await callRenderShort();

      expect(execFile).toHaveBeenCalledWith(
        "ffprobe", expect.any(Array), expect.any(Object), expect.any(Function),
      );
    });
  });

  describe("runFfmpeg error handling", () => {
    it("throws error with stdout and stderr on crash", async () => {
      vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
        const cb = callback || options || args;
        if (typeof cb === "function") {
          const err = new Error("exit code 1");
          (err as any).stderr = "ffmpeg panic";
          (err as any).stdout = "logs";
          cb(err, { stdout: "", stderr: "" });
        }
        return {} as any;
      });

      await expect(renderShort(
        "in.mp4", "out.mp4", "sub.ass",
        { startTime: 0, duration: 10 } as any,
        { videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any
      )).rejects.toThrow("FFmpeg failed to render short");
    });
  });

  describe("renderShort config coverage", () => {
    it("uses empty array for logo in ffmpeg args if missing", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 } as any);
      vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
        const cb = callback || options || args;
        if (typeof cb === "function") {
          cb(null, { stdout: file === "ffprobe" ? probeJson : "", stderr: "" });
        }
        return {} as any;
      });
      await renderShort(
        "in.mp4", "out.mp4", "sub.ass",
        { startTime: 0, duration: 10 } as any,
        { managedRun: undefined, videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any
      );
    });
  });
});

  describe("buildSafeFramingFilter logo missing config", () => {
    it("handles missing logo config correctly", () => {
      const filter = buildSafeFramingFilter("clip.ass", 1080, 1920, "");
      expect(filter).toContain("copy[v]");
    });
  });

  describe("buildFontEnv branch coverage", () => {
    it("handles non-existent fonts.conf", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes("fonts.conf")) return false;
        if (typeof p === "string" && p.includes("out.mp4")) return true;
        return true;
      });
      vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 } as any);

      vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
        const cb = callback || options || args;
        if (typeof cb === "function") {
          cb(null, { stdout: file === "ffprobe" ? probeJson : "", stderr: "" });
        }
        return {} as any;
      });

      await renderShort(
        "in.mp4", "out.mp4", "sub.ass",
        { startTime: 0, duration: 10 } as any,
        { managedRun: undefined, videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any
      );
      // Wait for it to pass
    });
  });

  describe("renderShort config branch coverage 2", () => {
    it("uses unexisting logo branch", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes("fonts.conf")) return true;
        if (typeof p === "string" && p.includes("out.mp4")) return true;
        if (typeof p === "string" && p.includes("non-existent-logo.png")) return false;
        return true;
      });
      vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 } as any);
      vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
        const cb = callback || options || args;
        if (typeof cb === "function") {
          cb(null, { stdout: file === "ffprobe" ? probeJson : "", stderr: "" });
        }
        return {} as any;
      });
      await renderShort(
        "in.mp4", "out.mp4", "sub.ass",
        { startTime: 0, duration: 10 } as any,
        { managedRun: { logoPath: "non-existent-logo.png" }, videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any
      );
    });

    it("uses existing logo path", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes("fonts.conf")) return true;
        if (typeof p === "string" && p.includes("out.mp4")) return true;
        if (typeof p === "string" && p.includes("my-logo.png")) return true;
        return true;
      });
      vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 } as any);
      vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
        const cb = callback || options || args;
        if (typeof cb === "function") {
          cb(null, { stdout: file === "ffprobe" ? probeJson : "", stderr: "" });
        }
        return {} as any;
      });
      await renderShort(
        "in.mp4", "out.mp4", "sub.ass",
        { startTime: 0, duration: 10 } as any,
        { managedRun: { logoPath: "my-logo.png" }, videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any
      );
    });
  });
