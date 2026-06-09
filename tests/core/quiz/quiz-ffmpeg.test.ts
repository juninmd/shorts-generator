import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runFFmpeg } from "../../../src/core/quiz/quiz-ffmpeg.service.js";
import { EventEmitter } from "node:events";
import * as child_process from "node:child_process";
import { logger } from "../../../src/core/logger.js";

vi.mock("node:child_process");
vi.mock("../../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe("quiz-ffmpeg.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should spawn ffmpeg and resolve on exit 0", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stderr = new EventEmitter();
    vi.mocked(child_process.spawn).mockReturnValue(mockChildProcess);

    const promise = runFFmpeg(["-i", "input.mp4"], "filter", "output.mp4", 10);

    mockChildProcess.emit("close", 0);
    await expect(promise).resolves.toBeUndefined();

    expect(child_process.spawn).toHaveBeenCalledWith("ffmpeg", expect.arrayContaining([
        "-i", "input.mp4",
        "-filter_complex", "filter",
        "-t", "10",
        expect.stringContaining("output.mp4")
    ]));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Vídeo gerado"));
  });

  it("should reject on non-zero exit code", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stderr = new EventEmitter();
    vi.mocked(child_process.spawn).mockReturnValue(mockChildProcess);

    const promise = runFFmpeg([], "", "out.mp4", 10);
    mockChildProcess.emit("close", 1);

    await expect(promise).rejects.toThrow("FFmpeg exited with code 1");
  });

  it("should parse progress and log it", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stderr = new EventEmitter();
    vi.mocked(child_process.spawn).mockReturnValue(mockChildProcess);

    const promise = runFFmpeg([], "", "out.mp4", 100);

    // Simulate ffmpeg output
    mockChildProcess.stderr.emit("data", "Input #0\n"); // should log debug
    mockChildProcess.stderr.emit("data", "time=00:00:10.00\n"); // 10%
    mockChildProcess.stderr.emit("data", "time=00:00:50.00\n"); // 50%
    mockChildProcess.stderr.emit("data", "time=00:00:50.00\n"); // 50% again (should not duplicate log)
    mockChildProcess.stderr.emit("data", "time=00:01:40.00\n"); // 100%
    mockChildProcess.stderr.emit("data", "\n"); // empty line

    mockChildProcess.emit("close", 0);
    await promise;

    expect(logger.debug).toHaveBeenCalledWith("Input #0");
    expect(logger.info).toHaveBeenCalledWith("⏳ Progresso FFmpeg: 10%");
    expect(logger.info).toHaveBeenCalledWith("⏳ Progresso FFmpeg: 50%");
    expect(logger.info).toHaveBeenCalledWith("⏳ Progresso FFmpeg: 100%");
  });

  it("should trigger keepAlive interval", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stderr = new EventEmitter();
    vi.mocked(child_process.spawn).mockReturnValue(mockChildProcess);

    const promise = runFFmpeg([], "", "out.mp4", 100);

    vi.advanceTimersByTime(5 * 60 * 1000 + 100);

    expect(logger.info).toHaveBeenCalledWith("⏳ ffmpeg still running...");

    mockChildProcess.emit("close", 0);
    await promise;
  });

  it("should handle buffer chunks without matching newlines", async () => {
    const mockChildProcess = new EventEmitter() as any;
    mockChildProcess.stderr = new EventEmitter();
    vi.mocked(child_process.spawn).mockReturnValue(mockChildProcess);

    const promise = runFFmpeg([], "", "out.mp4", 100);

    mockChildProcess.stderr.emit("data", Buffer.from("random garbage data without time or interesting info"));
    mockChildProcess.emit("close", 0);

    await promise;
    expect(logger.debug).not.toHaveBeenCalled();
  });
});
