import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { detectSpeakerFocusX, CENTER_FOCUS } from "../../src/core/face-framing.js";

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
});
