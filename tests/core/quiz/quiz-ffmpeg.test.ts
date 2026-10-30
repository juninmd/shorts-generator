import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import { runFFmpeg } from "../../../src/core/quiz/quiz-ffmpeg.service.js";
import child_process from "node:child_process";
import { EventEmitter } from "node:events";

vi.mock("node:child_process");
vi.mock("node:fs", () => ({ default: { rmSync: vi.fn() } }));

describe("quiz-ffmpeg.service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("runs FFmpeg successfully and parses progress", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();

    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);

    mockProcess.stderr.emit("data", Buffer.from("Duration: 00:01:40.00\n"));
    mockProcess.stderr.emit("data", Buffer.from("time=00:00:00.00\n")); // 0%
    mockProcess.stderr.emit("data", Buffer.from("time=00:00:00.00\n")); // 0% again to trigger if (pct !== lastPct) branch false
    mockProcess.stderr.emit("data", Buffer.from("time=00:00:10.00\n")); // 10%
    mockProcess.stderr.emit("data", Buffer.from("time=01:20:30.00\n")); // >100%

    mockProcess.emit("close", 0);

    await expect(promise).resolves.toBeUndefined();
    expect(child_process.spawn).toHaveBeenCalled();
  });

  it("rejects when FFmpeg exits with non-zero code", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();

    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);

    mockProcess.emit("close", 1);

    await expect(promise).rejects.toThrow("FFmpeg exited with code 1");
  });

  it("reports the end of stderr so a failed render explains itself", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i}`);
    mockProcess.stderr.emit("data", Buffer.from(lines.join("\n") + "\n"));
    mockProcess.emit("close", 1);

    const error = await promise.catch((err: Error) => err);
    expect(error.message).toContain("FFmpeg exited with code 1:");
    // only the tail is kept: the 25th line is there, the first ones are not
    expect(error.message).toContain("line 24");
    expect(error.message).not.toContain("line 0 ");
  });

  it("handles malformed hms gracefully by returning 0", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stderr = new EventEmitter();

      vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

      const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);

      // Should not throw or crash
      mockProcess.stderr.emit("data", Buffer.from("time=invalid\n"));
      mockProcess.emit("close", 0);

      await expect(promise).resolves.toBeUndefined();
  });

  it("triggers keepAlive interval", () => {
    vi.useFakeTimers();
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);

    vi.advanceTimersByTime(6 * 60 * 1000); // 6 mins

    mockProcess.emit("close", 0);
    vi.useRealTimers();
  });

  it("kills a wedged ffmpeg after FFMPEG_TIMEOUT_MS and reports the timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("FFMPEG_TIMEOUT_MS", "1000");
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);
    const assertion = expect(promise).rejects.toThrow("FFmpeg was killed after the 1000ms timeout");

    vi.advanceTimersByTime(1000);
    expect(mockProcess.kill).toHaveBeenCalledWith("SIGKILL");
    mockProcess.emit("close", null);

    await assertion;
    expect(fs.rmSync).toHaveBeenCalledWith("out.mp4", { force: true });
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("rejects when ffmpeg cannot start instead of crashing the worker", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);
    mockProcess.emit("error", new Error("spawn ffmpeg ENOENT"));

    await expect(promise).rejects.toThrow("FFmpeg failed to start: spawn ffmpeg ENOENT");
    expect(fs.rmSync).toHaveBeenCalledWith("out.mp4", { force: true });
  });

  it("removes the truncated output on a non-zero exit", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);
    mockProcess.emit("close", 2);

    await expect(promise).rejects.toThrow("FFmpeg exited with code 2");
    expect(fs.rmSync).toHaveBeenCalledWith("out.mp4", { force: true });
  });

  it("keeps the real error when the partial file cannot be removed", async () => {
    vi.mocked(fs.rmSync).mockImplementationOnce(() => {
      throw new Error("EBUSY");
    });
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);
    mockProcess.emit("close", 1);

    await expect(promise).rejects.toThrow("FFmpeg exited with code 1");
  });

  it("does not delete a finished deliverable when a late error event arrives", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    vi.mocked(child_process.spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "out.mp4", 100);
    mockProcess.emit("close", 0);
    await expect(promise).resolves.toBeUndefined();
    expect(fs.rmSync).not.toHaveBeenCalled();

    mockProcess.emit("error", new Error("late ipc error"));
    mockProcess.emit("close", 1);
    expect(fs.rmSync).not.toHaveBeenCalled();
  });
});
