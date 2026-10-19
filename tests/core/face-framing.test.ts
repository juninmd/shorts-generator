import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs";
import {
  detectSpeakerFocusX, CENTER_FOCUS, trackSpeakerFocus, resolveSpeakerFocus, buildCropXExpression,
} from "../../src/core/face-framing.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, existsSync: vi.fn() } };
});

const clip = { startTime: 10, duration: 20 };

function mockExec(result: { stdout?: string; err?: Error }) {
  vi.mocked(execFile).mockImplementation((_f: any, _a: any, _o: any, cb?: any) => {
    const done = cb || _o;
    if (result.err) done(result.err, { stdout: "", stderr: "" });
    else done(null, { stdout: result.stdout ?? "", stderr: "" });
    return {} as any;
  });
}

describe("detectSpeakerFocusX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SPEAKER_FOCUS;
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });
  afterEach(() => {
    delete process.env.SPEAKER_FOCUS;
  });

  it("returns the detected focus when the helper reports a face position", async () => {
    mockExec({ stdout: "0.7200\n" });
    expect(await detectSpeakerFocusX("in.mp4", clip)).toBeCloseTo(0.72);
  });

  it("falls back to center when detection is disabled", async () => {
    process.env.SPEAKER_FOCUS = "false";
    expect(await detectSpeakerFocusX("in.mp4", clip)).toBe(CENTER_FOCUS);
    expect(execFile).not.toHaveBeenCalled();
  });

  it("falls back to center when the helper script is missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(await detectSpeakerFocusX("in.mp4", clip)).toBe(CENTER_FOCUS);
    expect(execFile).not.toHaveBeenCalled();
  });

  it("falls back to center when the helper fails", async () => {
    mockExec({ err: new Error("no cv2") });
    expect(await detectSpeakerFocusX("in.mp4", clip)).toBe(CENTER_FOCUS);
  });

  it("falls back to center on non-numeric output", async () => {
    mockExec({ stdout: "" });
    expect(await detectSpeakerFocusX("in.mp4", clip)).toBe(CENTER_FOCUS);
  });

  it("clamps out-of-range values into [0,1]", async () => {
    mockExec({ stdout: "1.9" });
    expect(await detectSpeakerFocusX("in.mp4", clip)).toBe(1);
  });

  it("handles string error thrown during exec", async () => {
    vi.mocked(execFile).mockImplementation((_f: any, _a: any, _o: any, cb?: any) => {
      const done = cb || _o;
      done("string error", { stdout: "", stderr: "" });
      return {} as any;
    });
    expect(await detectSpeakerFocusX("in.mp4", clip)).toBe(CENTER_FOCUS);
  });
});

describe("trackSpeakerFocus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SPEAKER_FOCUS;
    delete process.env.SPEAKER_TRACKING;
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });
  afterEach(() => {
    delete process.env.SPEAKER_FOCUS;
    delete process.env.SPEAKER_TRACKING;
  });

  it("returns simplified keyframes from the tracker output", async () => {
    mockExec({ stdout: "[[0.25,0.2],[0.75,0.2],[1.25,0.8],[1.75,0.8],[2.25,0.8]]" });
    expect(await trackSpeakerFocus("in.mp4", clip)).toEqual([
      { t: 0.25, x: 0.2 }, { t: 0.95, x: 0.2 }, { t: 1.25, x: 0.8 },
    ]);
  });

  it.each(["SPEAKER_FOCUS", "SPEAKER_TRACKING"])("is disabled by %s=false", async (name) => {
    process.env[name] = "false";
    expect(await trackSpeakerFocus("in.mp4", clip)).toEqual([]);
    expect(execFile).not.toHaveBeenCalled();
  });

  it("is empty when the tracker script is missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(await trackSpeakerFocus("in.mp4", clip)).toEqual([]);
  });

  it("is empty when the tracker fails (no OpenCV, no face)", async () => {
    mockExec({ err: new Error("exit 1") });
    expect(await trackSpeakerFocus("in.mp4", clip)).toEqual([]);
  });

  it("is empty when the tracker prints junk or a non-Error is thrown", async () => {
    mockExec({ stdout: "not json" });
    expect(await trackSpeakerFocus("in.mp4", clip)).toEqual([]);
    vi.mocked(execFile).mockImplementation((_f: any, _a: any, _o: any, cb?: any) => {
      (cb || _o)("boom", { stdout: "", stderr: "" });
      return {} as any;
    });
    expect(await trackSpeakerFocus("in.mp4", clip)).toEqual([]);
  });
});

describe("resolveSpeakerFocus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SPEAKER_FOCUS;
    delete process.env.SPEAKER_TRACKING;
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it("prefers tracked keyframes", async () => {
    mockExec({ stdout: "[[0.25,0.3]]" });
    expect(await resolveSpeakerFocus("in.mp4", clip)).toEqual([{ t: 0.25, x: 0.3 }]);
  });

  it("falls back to the static single-position focus", async () => {
    process.env.SPEAKER_TRACKING = "false";
    mockExec({ stdout: "0.6" });
    expect(await resolveSpeakerFocus("in.mp4", clip)).toBeCloseTo(0.6);
    delete process.env.SPEAKER_TRACKING;
  });
});

describe("buildCropXExpression", () => {
  it("clamps a static focus into the frame", () => {
    expect(buildCropXExpression(1080, 1.4)).toBe("'clip((in_w*1.0000)-(1080/2)\\,0\\,in_w-1080)'");
  });

  it("animates the crop with keyframes", () => {
    const expression = buildCropXExpression(1080, [{ t: 0, x: 0.2 }, { t: 2, x: 0.8 }]);
    expect(expression).toContain("clip((in_w*(if(lt(t\\,0.0000)");
    expect(expression).toContain("(t-0.0000)/2.0000");
  });
});
