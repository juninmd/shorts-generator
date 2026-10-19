import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { detectLetterbox, focusInBox, parseCropDetect, parseSourceWidth } from "../../src/core/letterbox.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../../src/core/ffmpeg-bin.js", () => ({ ffmpegBin: () => "ffmpeg" }));

const log = (crops: string[], video = "Stream #0:0: Video: h264 (High), yuv420p, 640x480, 25 fps") =>
  `${video}\n${crops.map((c) => `[Parsed_cropdetect_1 @ 0x1] x1:0 y1:0 crop=${c}`).join("\n")}`;
const run = (result: { stderr?: string; err?: Error }) =>
  vi.mocked(execFile).mockImplementation(((_f: any, _a: any, _o: any, cb: any) => {
    if (result.err) cb(result.err, { stdout: "", stderr: "" });
    else cb(null, { stdout: "", stderr: result.stderr });
    return {} as any;
  }) as any);

describe("letterbox parsing", () => {
  it("picks the most frequent crop suggestion", () => {
    expect(parseCropDetect(log(["640:360:0:60", "640:362:0:59", "640:360:0:60"]))).toEqual({ width: 640, height: 360, x: 0, y: 60 });
    expect(parseCropDetect("no crops here")).toBeNull();
  });

  it("reads the source width", () => {
    expect(parseSourceWidth(log([]))).toBe(640);
    expect(parseSourceWidth("nothing")).toBeNull();
  });

  it("maps a position into the cropped frame, clamped", () => {
    const info = { box: { width: 360, height: 640, x: 140, y: 0 }, sourceWidth: 640 };
    expect(focusInBox(0.5, info)).toBe(0.5);
    expect(focusInBox(0.1, info)).toBe(0);
    expect(focusInBox(0.95, info)).toBe(1);
  });
});

describe("detectLetterbox", () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env.AUTO_CROP; });
  afterEach(() => { delete process.env.AUTO_CROP; });

  it("returns the box and source width when bars are worth removing", async () => {
    run({ stderr: log(["640:360:0:60"]) });
    expect(await detectLetterbox("in.mp4", 10, 30)).toEqual({ box: { width: 640, height: 360, x: 0, y: 60 }, sourceWidth: 640 });
    const args = vi.mocked(execFile).mock.calls[0]![1] as string[];
    expect(args[args.indexOf("-ss") + 1]).toBe("12");
  });

  it("is null for a full frame, no suggestion, unknown source or ffmpeg failure", async () => {
    run({ stderr: log(["640:480:0:0"]) });
    expect(await detectLetterbox("in.mp4", 0, 10)).toBeNull();
    run({ stderr: "nothing" });
    expect(await detectLetterbox("in.mp4", 0, 10)).toBeNull();
    run({ stderr: "crop=640:360:0:60" });
    expect(await detectLetterbox("in.mp4", 0, 10)).toBeNull();
    run({ err: new Error("boom") });
    expect(await detectLetterbox("in.mp4", 0, 10)).toBeNull();
  });

  it("can be disabled", async () => {
    process.env.AUTO_CROP = "false";
    expect(await detectLetterbox("in.mp4", 0, 10)).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });
});
