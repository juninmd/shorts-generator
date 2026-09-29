import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import * as child_process from "node:child_process";
import ffmpeg from "fluent-ffmpeg";
import { narrateChapter, narrateChapters } from "../../../src/core/comic/comic-tts.js";

vi.mock("node:fs");
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("fluent-ffmpeg");

describe("comic-tts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PYTHON_BIN = "python";
  });

  afterEach(() => {
    delete process.env.PYTHON_BIN;
  });

  const mockChapter = {
    id: "ch1",
    title: "Test Chapter",
    imagePath: "/tmp/ch1.png",
    narrationText: "Test narration",
  };

  it("narrateChapter throws if script is missing", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    await expect(narrateChapter(mockChapter, "/tmp", "voice")).rejects.toThrow("Missing TTS helper script");
  });

  it("narrateChapter succeeds", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify([{ word: "Test", start: 0, end: 1 }]));

    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);

    vi.spyOn(ffmpeg, "ffprobe").mockImplementation((path: any, cb: any) => {
      cb(null, { format: { duration: 5 } });
    });

    const result = await narrateChapter(mockChapter, "/tmp", "voice");
    expect(result.durationSec).toBe(5);
    expect(result.words.length).toBe(1);
    expect(result.audioPath).toContain("ch1.mp3");
  });

  it("narrateChapter handles ffprobe error", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify([]));

    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);

    vi.spyOn(ffmpeg, "ffprobe").mockImplementation((path: any, cb: any) => {
      cb(new Error("ffprobe error"), null);
    });

    await expect(narrateChapter(mockChapter, "/tmp", "voice")).rejects.toThrow("ffprobe error");
  });

  it("narrateChapter handles missing duration", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify([]));

    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);

    vi.spyOn(ffmpeg, "ffprobe").mockImplementation((path: any, cb: any) => {
      cb(null, { format: {} }); // no duration
    });

    const result = await narrateChapter(mockChapter, "/tmp", "voice");
    expect(result.durationSec).toBe(0);
  });

  it("narrateChapters processes multiple chapters", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify([]));

    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);

    vi.spyOn(ffmpeg, "ffprobe").mockImplementation((path: any, cb: any) => {
      cb(null, { format: { duration: 10 } });
    });

    const result = await narrateChapters([mockChapter, { ...mockChapter, id: "ch2" }], "/tmp", "voice");
    expect(result.length).toBe(2);
    expect(result[0].durationSec).toBe(10);
    expect(result[1].durationSec).toBe(10);
  });

  it("narrateChapter uses default python if PYTHON_BIN is not set", async () => {
    delete process.env.PYTHON_BIN;
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify([]));

    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);

    vi.spyOn(ffmpeg, "ffprobe").mockImplementation((path: any, cb: any) => {
      cb(null, { format: { duration: 5 } });
    });

    await narrateChapter(mockChapter, "/tmp", "voice");
    expect(child_process.execFile).toHaveBeenCalledWith("python", expect.any(Array), expect.any(Object), expect.any(Function));
  });
});
