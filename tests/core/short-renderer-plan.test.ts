import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { buildSafeFramingFilter, renderShort } from "../../src/core/short-renderer.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, existsSync: vi.fn(), statSync: vi.fn(), mkdirSync: vi.fn() } };
});

const probeJson = JSON.stringify({
  format: { duration: "10" },
  streams: [
    { codec_type: "video", codec_name: "h264", width: 1080, height: 1920, r_frame_rate: "30/1" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "44100", channels: 2 },
  ],
});
const tracker = "[[0.25,0.5],[0.75,0.5],[1.25,0.5],[1.75,0.9],[2.25,0.9],[2.75,0.9]]";
const cropLog = "Stream #0:0: Video: h264, yuv420p, 640x480\ncrop=640:360:0:60";

function dispatch(options: { tracker?: string | null; faceX?: string } = {}) {
  vi.mocked(execFile).mockImplementation(((file: string, args: string[], _o: any, cb: any) => {
    const joined = args.join(" ");
    if (file === "ffprobe") return cb(null, { stdout: probeJson, stderr: "" });
    if (joined.includes("track_speaker.py")) {
      return options.tracker === null ? cb(new Error("no cv2"), { stdout: "", stderr: "" }) : cb(null, { stdout: options.tracker ?? tracker, stderr: "" });
    }
    if (joined.includes("detect_face.py")) return cb(null, { stdout: options.faceX ?? "0.5", stderr: "" });
    if (joined.includes("cropdetect")) return cb(null, { stdout: "", stderr: cropLog });
    if (joined.includes("showinfo")) return cb(null, { stdout: "", stderr: "pts_time:1.5" });
    return cb(null, { stdout: "", stderr: "" });
  }) as any);
}

const mainCall = () => vi.mocked(execFile).mock.calls.find((call) => (call[1] as string[]).includes("-filter_complex"))![1] as string[];
const graphOf = () => { const args = mainCall(); return args[args.indexOf("-filter_complex") + 1]!; };
const clip = { startTime: 5, duration: 10 } as any;
const config = { videoEncoder: "libx264", verticalWidth: 1080, verticalHeight: 1920 } as any;

describe("renderShort with an edit plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 500 * 1024 } as any);
    ["SPEAKER_TRACKING", "AUTO_CROP", "BGM_FILE"].forEach((name) => delete process.env[name]);
  });
  afterEach(() => ["SPEAKER_TRACKING", "AUTO_CROP", "BGM_FILE"].forEach((name) => delete process.env[name]));

  it("concatenates cuts, crops bars, pans on the edited timeline and overlays B-roll", async () => {
    dispatch();
    process.env.BGM_FILE = "bgm.mp3";
    await renderShort("in.mp4", "out.mp4", "sub.ass", clip, config, {
      ranges: [{ start: 0, end: 2 }, { start: 3, end: 8 }],
      sourceDuration: 12,
      broll: [{ at: 3, duration: 2.6, path: "b.mp4" }],
    });
    const graph = graphOf();
    const args = mainCall();
    expect(graph).toContain("[0:v]trim=start=0.000:end=2.000");
    expect(graph).toContain("[cv]crop=640:360:0:60,scale=");
    expect(graph).toContain("[pre][brv0]overlay=enable='between(t\\,3.000\\,5.600)'");
    expect(graph).toContain("[ca]highpass=f=70");
    expect(graph).toContain("[1:a]aresample=44100");
    expect(graph).toContain("[2:v]trim=duration=2.6");
    expect(args).toEqual(expect.arrayContaining(["-stream_loop", "bgm.mp3", "b.mp4"]));
    expect(args[args.indexOf("-t") + 1]).toBe("2.6");
    // the tracker analysed the original 12s, scene cuts included
    const python = vi.mocked(execFile).mock.calls.find((c) => (c[1] as string[]).some((a) => a.endsWith("track_speaker.py")))![1] as string[];
    expect(python.slice(-2)).toEqual(["5", "12"]);
    expect(graph).toContain("if(lt(t\\,");
  });

  it("maps a static focus into the cropped frame when tracking is unavailable", async () => {
    dispatch({ tracker: null, faceX: "0.5" });
    await renderShort("in.mp4", "out.mp4", "sub.ass", clip, config);
    expect(graphOf()).toContain("crop=640:360:0:60,scale=");
    expect(graphOf()).toContain("in_w*0.5000");
    expect(graphOf()).not.toContain("trim=start");
  });

  it("keeps tracked keyframes un-remapped when nothing was cut", async () => {
    dispatch();
    await renderShort("in.mp4", "out.mp4", "sub.ass", clip, config, { sourceDuration: 10, broll: [] });
    expect(graphOf()).toContain("[0:v]crop=640:360:0:60");
    expect(graphOf()).toContain("t\\,");
  });

  it("skips scene detection and bar detection when disabled and keeps the plain filter", async () => {
    dispatch({ tracker: null, faceX: "0.3" });
    process.env.SPEAKER_TRACKING = "false";
    process.env.AUTO_CROP = "false";
    await renderShort("in.mp4", "out.mp4", "sub.ass", clip, config);
    expect(vi.mocked(execFile).mock.calls.some((c) => (c[1] as string[]).join(" ").includes("showinfo"))).toBe(false);
    expect(graphOf()).toContain("in_w*0.3000");
    expect(graphOf()).not.toContain("crop=640:360");
  });
});

describe("buildSafeFramingFilter layouts", () => {
  it("places B-roll before the captions so cutaways never hide them", () => {
    const filter = buildSafeFramingFilter("sub.ass", 1080, 1920, "/logo.png", 0.5, {
      videoInput: "[cv]", broll: { items: [{ at: 4, duration: 2, path: "b.mp4" }], firstInputIndex: 3 },
    });
    expect(filter.indexOf("[cv]scale=")).toBe(0);
    expect(filter.indexOf("overlay=enable")).toBeLessThan(filter.indexOf("ass='sub.ass'"));
    expect(filter).toContain("[bro]ass='sub.ass'[base]");
    expect(filter).toContain("[base][logo]overlay=W-w-36:36[v]");
  });

  it("is unchanged without a layout", () => {
    expect(buildSafeFramingFilter("sub.ass", 1080, 1920)).toMatch(/^\[0:v\]scale=.*setsar=1,ass='sub.ass'\[base\];\[base\]copy\[v\]$/);
  });
});
