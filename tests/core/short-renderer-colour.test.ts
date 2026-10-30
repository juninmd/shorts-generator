import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { renderShort } from "../../src/core/short-renderer.js";
import { supportsTonemap } from "../../src/core/hdr-tonemap.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, existsSync: vi.fn(), statSync: vi.fn(), mkdirSync: vi.fn() } };
});
vi.mock("../../src/core/hdr-tonemap.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core/hdr-tonemap.js")>();
  return { ...actual, supportsTonemap: vi.fn().mockResolvedValue(true) };
});

const probeJson = JSON.stringify({
  format: { duration: "10" },
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 },
  ],
});

const render = () => renderShort(
  "in.mp4", "out.mp4", "sub.ass",
  { startTime: 0, duration: 10 } as any,
  { videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any,
);

const filterFor = () => {
  const call = vi.mocked(execFile).mock.calls.find((c) => (c[1] as string[]).includes("-filter_complex"))!;
  const args = call[1] as string[];
  return args[args.indexOf("-filter_complex") + 1]!;
};

const probeWith = (stream: Record<string, unknown>) => {
  vi.mocked(execFile).mockImplementation((file: any, args: any, options: any, callback?: any) => {
    const cb = callback || options || args;
    if (typeof cb === "function") {
      const output = file === "ffprobe"
        ? ((args as string[]).includes("-select_streams") ? JSON.stringify({ streams: [stream] }) : probeJson)
        : "";
      cb(null, { stdout: output, stderr: "" });
    }
    return {} as any;
  });
};

describe("short renderer colour handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 150 * 1024 } as any);
  });

  it("tone maps an HDR source instead of tagging it as SDR", async () => {
    probeWith({ color_space: "bt2020nc", color_transfer: "smpte2084" });
    await render();
    expect(filterFor()).toContain("tonemap=tonemap=hable:desat=0");
  });

  it("warns and skips the tone map when this ffmpeg cannot do it", async () => {
    vi.mocked(supportsTonemap).mockResolvedValueOnce(false);
    probeWith({ color_space: "bt2020nc", color_transfer: "arib-std-b67" });
    await render();
    expect(filterFor()).not.toContain("tonemap");
  });

  it("converts a BT.601 source before scaling", async () => {
    probeWith({ color_space: "smpte170m" });
    await render();
    expect(filterFor()).toContain("colorspace=all=bt709:iall=smpte170m:fast=1,scale=");
  });

  it("keeps the source tags when HDR cannot be tone-mapped here", async () => {
    vi.mocked(supportsTonemap).mockResolvedValueOnce(false);
    probeWith({ color_space: "bt2020nc", color_transfer: "smpte2084" });
    await render();
    const args = vi.mocked(execFile).mock.calls.find((c) => (c[1] as string[]).includes("-filter_complex"))![1] as string[];
    expect(args).not.toContain("-colorspace");
    expect(args).not.toContain("-x264-params");
  });

  it("leaves a BT.709 source untouched", async () => {
    probeWith({ color_space: "bt709", color_transfer: "bt709" });
    await render();
    expect(filterFor()).not.toContain("colorspace=");
  });
});
