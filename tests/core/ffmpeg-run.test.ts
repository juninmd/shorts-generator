import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { execFile } from "node:child_process";
import {
  describeFfmpegFailure,
  ffmpegBaseArgs,
  ffmpegTimeoutMs,
  runFfmpeg,
} from "../../src/core/ffmpeg-run.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

describe("ffmpeg runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("always passes -hide_banner and -nostdin", () => {
    expect(ffmpegBaseArgs()).toEqual(["-hide_banner", "-nostdin"]);
  });

  it("reads FFMPEG_TIMEOUT_MS with a 30 minute fallback", () => {
    expect(ffmpegTimeoutMs()).toBe(30 * 60 * 1000);
    vi.stubEnv("FFMPEG_TIMEOUT_MS", "5000");
    expect(ffmpegTimeoutMs()).toBe(5000);
    vi.stubEnv("FFMPEG_TIMEOUT_MS", "not-a-number");
    expect(ffmpegTimeoutMs()).toBe(30 * 60 * 1000);
    vi.stubEnv("FFMPEG_TIMEOUT_MS", "0");
    expect(ffmpegTimeoutMs()).toBe(30 * 60 * 1000);
    vi.stubEnv("FFMPEG_TIMEOUT_MS", "-10");
    expect(ffmpegTimeoutMs()).toBe(30 * 60 * 1000);
  });

  it("runs ffmpeg with the shared flags and reports its stderr", async () => {
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      args.at(-1)(null, { stdout: "", stderr: "frame= 30" });
      return {} as any;
    });

    const result = await runFfmpeg(["-i", "in.mp4", "out.mp4"], { maxBufferBytes: 1024 });

    expect(result.stderr).toBe("frame= 30");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(execFile).toHaveBeenCalledWith(
      "ffmpeg",
      ["-hide_banner", "-nostdin", "-i", "in.mp4", "out.mp4"],
      expect.objectContaining({ timeout: 30 * 60 * 1000, killSignal: "SIGKILL", maxBuffer: 1024 }),
      expect.any(Function),
    );
  });

  it("defaults the buffer and an absent stderr", async () => {
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      args.at(-1)(null, { stdout: "" });
      return {} as any;
    });

    const result = await runFfmpeg(["-i", "in.mp4"]);

    expect(result.stderr).toBe("");
    expect(execFile).toHaveBeenCalledWith(
      "ffmpeg", expect.any(Array),
      expect.objectContaining({ maxBuffer: 100 * 1024 * 1024 }),
      expect.any(Function),
    );
  });

  it("removes the partial output and keeps the end of stderr on failure", async () => {
    const rm = vi.spyOn(fs, "rmSync").mockImplementation(() => undefined);
    const stderr = `${"x".repeat(3000)}BOOM`;
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      const error = Object.assign(new Error("exit 1"), { code: 1, stderr });
      args.at(-1)(error);
      return {} as any;
    });

    await expect(runFfmpeg(["-i", "in.mp4"], { outputPath: "partial.mp4" }))
      .rejects.toThrow(/FFmpeg failed \(exit 1\): .*BOOM/);
    expect(rm).toHaveBeenCalledWith("partial.mp4", { force: true });
    rm.mockRestore();
  });

  it("reports a timeout when ffmpeg was killed", async () => {
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      args.at(-1)(Object.assign(new Error("killed"), { killed: true }));
      return {} as any;
    });

    await expect(runFfmpeg(["-i", "in.mp4"])).rejects.toThrow(
      "FFmpeg was killed after the 1800000ms timeout",
    );
  });

  it("falls back to the error message when stderr is empty", async () => {
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      args.at(-1)(Object.assign(new Error("spawn ffmpeg ENOENT"), { stderr: "   " }));
      return {} as any;
    });

    await expect(runFfmpeg(["-i", "in.mp4"])).rejects.toThrow("FFmpeg failed: spawn ffmpeg ENOENT");
  });

  it("keeps the real error when the partial file cannot be removed", async () => {
    const rm = vi.spyOn(fs, "rmSync").mockImplementation(() => {
      throw new Error("EBUSY");
    });
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      args.at(-1)(Object.assign(new Error("boom"), { code: 2 }));
      return {} as any;
    });

    await expect(runFfmpeg(["-i", "in.mp4"], { outputPath: "busy.mp4" }))
      .rejects.toThrow("FFmpeg failed (exit 2): boom");
    rm.mockRestore();
  });

  it("describes a failure without an exit code", () => {
    expect(describeFfmpegFailure({ message: "plain" }, 1000)).toBe("FFmpeg failed: plain");
    expect(describeFfmpegFailure({ message: "plain", code: "ETIMEDOUT" }, 1000)).toBe("FFmpeg failed: plain");
    expect(describeFfmpegFailure({ killed: true }, 1000)).toBe("FFmpeg was killed after the 1000ms timeout");
    expect(describeFfmpegFailure({}, 1000)).toBe("FFmpeg failed: unknown error");
  });
});
