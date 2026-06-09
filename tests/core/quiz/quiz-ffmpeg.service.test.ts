import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { runFFmpeg } from "../../../src/core/quiz/quiz-ffmpeg.service";
import { logger } from "../../../src/core/logger";

vi.mock("node:child_process");
vi.mock("../../../src/core/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Quiz FFmpeg Service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should run ffmpeg successfully and resolve", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "output.mp4", 100);

    // Simulate progress updates
    mockProcess.stderr.emit("data", "Input #0\nDuration: 00:00:10\n");
    mockProcess.stderr.emit("data", "time=00:00:50.00\n"); // 50%
    mockProcess.stderr.emit("data", "time=00:01:40.00\n"); // 100%
    mockProcess.stderr.emit("data", "time=invalid\n"); // no match
    mockProcess.stderr.emit("data", "\n"); // empty line

    // Test keepAlive by fast-forwarding time
    vi.advanceTimersByTime(6 * 60 * 1000);

    mockProcess.emit("close", 0);

    await expect(promise).resolves.toBeUndefined();

    expect(spawn).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining([
      "-y", "-hide_banner", "-i", "input.mp4", "-filter_complex", "filter",
      "-t", "100"
    ]));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Progresso FFmpeg: 50%"));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Progresso FFmpeg: 100%"));
    expect(logger.info).toHaveBeenCalledWith("⏳ ffmpeg still running...");
    expect(logger.debug).toHaveBeenCalledWith("Input #0");
  });

  it("should handle error exit code", async () => {
    const mockProcess = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(mockProcess);

    const promise = runFFmpeg([], "", "out", 10);
    mockProcess.emit("close", 1);

    await expect(promise).rejects.toThrow("FFmpeg exited with code 1");
  });

  it("should handle empty or malformed stderr outputs gracefully", async () => {
     const mockProcess = new EventEmitter() as any;
     mockProcess.stderr = new EventEmitter();
     vi.mocked(spawn).mockReturnValue(mockProcess);

     const promise = runFFmpeg([], "", "out", 10);
     mockProcess.stderr.emit("data", Buffer.from("time=00:00:05.00")); // Buffer usage
     mockProcess.emit("close", 0);

     await expect(promise).resolves.toBeUndefined();
     expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Progresso FFmpeg: 50%"));
  });

  it("should handle missing hours/minutes gracefully inside hmsToSeconds via 00 bypass", async () => {
     const mockProcess = new EventEmitter() as any;
     mockProcess.stderr = new EventEmitter();
     vi.mocked(spawn).mockReturnValue(mockProcess);

     const promise = runFFmpeg([], "", "out", 100);
     mockProcess.stderr.emit("data", "time=00:00:00.00");
     mockProcess.emit("close", 0);

     await expect(promise).resolves.toBeUndefined();
     expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Progresso FFmpeg: 0%"));
  });

  it("should cover branch where parts array is smaller than 3", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stderr = new EventEmitter();
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const originalMatch = String.prototype.match;
      String.prototype.match = vi.fn().mockReturnValue([ "time=00.00", "00.00" ]); // only 1 part!

      const promise = runFFmpeg([], "", "out", 100);
      mockProcess.stderr.emit("data", "time=dummy");
      mockProcess.emit("close", 0);

      await expect(promise).resolves.toBeUndefined();

      String.prototype.match = originalMatch; // restore
  });
});
