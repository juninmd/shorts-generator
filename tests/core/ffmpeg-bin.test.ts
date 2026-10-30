import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

import { execFile } from "node:child_process";
import { ffmpegBin, ffprobeBin, probeFormat, probeVideoStream } from "../../src/core/ffmpeg-bin.js";

function mockProbe(stdout: string) {
  vi.mocked(execFile).mockImplementation(((_f: any, _a: any, _o: any, cb: any) => {
    cb(null, { stdout, stderr: "" });
    return {} as any;
  }) as any);
}

describe("ffmpeg-bin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("defaults to ffmpeg/ffprobe on PATH", () => {
    vi.stubEnv("FFMPEG_PATH", "");
    vi.stubEnv("FFPROBE_PATH", "");
    expect(ffmpegBin()).toBe("ffmpeg");
    expect(ffprobeBin()).toBe("ffprobe");
  });

  it("honors FFMPEG_PATH and FFPROBE_PATH", () => {
    vi.stubEnv("FFMPEG_PATH", "/opt/ffmpeg");
    vi.stubEnv("FFPROBE_PATH", "/opt/ffprobe");
    expect(ffmpegBin()).toBe("/opt/ffmpeg");
    expect(ffprobeBin()).toBe("/opt/ffprobe");
  });

  it("probeFormat parses the format block from ffprobe JSON", async () => {
    vi.stubEnv("FFPROBE_PATH", "");
    mockProbe(JSON.stringify({ format: { duration: "12.5", start_time: "0.0" } }));
    await expect(probeFormat("a.mp4")).resolves.toEqual({ duration: "12.5", start_time: "0.0" });
    expect(execFile).toHaveBeenCalledWith("ffprobe", expect.arrayContaining(["a.mp4"]), expect.any(Object), expect.any(Function));
  });

  it("probeFormat returns an empty object when the format block is absent", async () => {
    mockProbe("{}");
    await expect(probeFormat("a.mp4")).resolves.toEqual({});
  });

  it("probeVideoStream returns the source's colour matrix", async () => {
    vi.stubEnv("FFPROBE_PATH", "");
    mockProbe(JSON.stringify({ streams: [{ codec_name: "h264", width: 1920, height: 1080, color_space: "bt709" }] }));
    await expect(probeVideoStream("a.mp4")).resolves.toMatchObject({ color_space: "bt709", width: 1920 });
    expect(execFile).toHaveBeenCalledWith(
      "ffprobe",
      expect.arrayContaining(["-select_streams", "v:0", "a.mp4"]),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("probeVideoStream returns an empty object when there is no picture", async () => {
    mockProbe(JSON.stringify({ streams: [] }));
    await expect(probeVideoStream("a.mp4")).resolves.toEqual({});
    mockProbe("{}");
    await expect(probeVideoStream("a.mp4")).resolves.toEqual({});
  });

  it("probeVideoStream degrades to an empty object when ffprobe fails", async () => {
    vi.mocked(execFile).mockImplementation(((_f: any, _a: any, _o: any, cb: any) => {
      cb(new Error("no such file"));
      return {} as any;
    }) as any);
    await expect(probeVideoStream("missing.mp4")).resolves.toEqual({});
  });
});
