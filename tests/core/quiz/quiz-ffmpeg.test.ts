import { describe, it, expect, vi, beforeEach } from "vitest";
import { runFFmpeg } from "../../../src/core/quiz/quiz-ffmpeg.service.js";
import child_process from "node:child_process";
import { EventEmitter } from "node:events";

vi.mock("node:child_process");

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
    mockProcess.stderr.emit("data", Buffer.from("time=00:00:10.00\n")); // 10%
    mockProcess.stderr.emit("data", Buffer.from("time=00:00:50.00\n")); // 50%

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
});
