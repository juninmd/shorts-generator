import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribeVideo } from "../../src/core/transcriber.js";
import type { DownloadedVideo, PipelineConfig } from "../../src/types.js";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";

vi.mock("node:child_process", () => {
  const mockChildProcess = {
    stdout: { setEncoding: vi.fn(), on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event, cb) => {
      if (event === "close") cb(0);
    }),
  };

  return {
    execFile: vi.fn(),
    spawn: vi.fn().mockReturnValue(mockChildProcess),
  };
});

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

describe("transcriber", () => {
  const mockConfig = {
    tempDir: "/tmp",
    whisperModel: "tiny",
  } as PipelineConfig;

  const mockVideo: DownloadedVideo = {
    id: "vid1",
    audioPath: "/tmp/vid1.wav",
    filePath: "/tmp/vid1.mp4",
    title: "Title",
    url: "url",
    channelName: "channel",
    channelUrl: "curl",
    duration: 60,
    publishedAt: "now",
    fileSize: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse Whisper output successfully", async () => {
    const mockWhisperOutput = {
      text: "Hello world.",
      language: "en",
      segments: [
        {
          start: 0,
          end: 1,
          text: "Hello",
          words: [{ start: 0, end: 0.5, word: "Hello" }],
        },
        {
          start: 1,
          end: 2,
          text: "world.",
          words: [{ start: 1, end: 1.5, word: "world." }],
        },
      ],
    };

    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "uv 0.2.0", stderr: "" });
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockWhisperOutput));

    const result = await transcribeVideo(mockVideo, mockConfig);

    expect(result.videoId).toBe("vid1");
    expect(result.duration).toBe(60);
    expect(result.segments).toHaveLength(2);
    expect(result.words).toHaveLength(2);
    expect(result.fullText).toBe("Hello world.");
    expect(result.language).toBe("en");
  });

  it("should fail if output file not found", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "uv 0.2.0", stderr: "" });
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(transcribeVideo(mockVideo, mockConfig)).rejects.toThrow(/Whisper output not found/);
  });

  it("should fail if spawn errors during whisper run", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "uv 0.2.0", stderr: "" });
      return {} as any;
    });

    vi.mocked(spawn).mockImplementationOnce((cmd, args) => {
      const mockChild = {
        stdout: { setEncoding: vi.fn(), on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, cb) => {
          if (event === "close") cb(1); // Fail the spawn process just for this test
        }),
      };
      return mockChild as any;
    });

    await expect(transcribeVideo(mockVideo, mockConfig)).rejects.toThrow(/Transcription failed with code 1/);
  });

  it("should throw if no compatible uv found", async () => {
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(new Error("Command not found"), { stdout: "", stderr: "" });
      return {} as any;
    });

    await expect(transcribeVideo(mockVideo, mockConfig)).rejects.toThrow(/No compatible uv installation found/);
  });

  it("should skip invalid uv versions", async () => {
    let callCount = 0;
    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (args && args.includes("--version")) {
        callCount++;
        // First candidate returns old version
        if (callCount === 1) {
          if (typeof cb === "function") cb(null, { stdout: "uv 0.1.0", stderr: "" });
        } else {
          // Second candidate returns valid version
          if (typeof cb === "function") cb(null, { stdout: "uv 0.2.0", stderr: "" });
        }
      } else {
        if (typeof cb === "function") cb(null, { stdout: "success", stderr: "" });
      }
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ language: "en" }));

    await transcribeVideo(mockVideo, mockConfig);
    expect(callCount).toBeGreaterThan(1);
  });

  it("should handle missing segments and words in whisper output safely", async () => {
    const mockWhisperOutput = {}; // Missing language, segments, and words

    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "uv 0.2.0", stderr: "" });
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockWhisperOutput));

    const result = await transcribeVideo(mockVideo, mockConfig);

    expect(result.segments).toHaveLength(0);
    expect(result.words).toHaveLength(0);
    expect(result.language).toBe("pt"); // default fallback
  });

  it("should handle partially missing properties in whisper segments", async () => {
    const mockWhisperOutput = {
      language: "en",
      segments: [
        {
          // missing start, end, text, and words
        },
        {
          text: "Some text",
          words: [
            {} // missing word, start, end
          ]
        }
      ]
    };

    vi.mocked(execFile).mockImplementation((file: string, args: any, options: any, callback?: any) => {
      const cb = callback || options || args;
      if (typeof cb === "function") cb(null, { stdout: "uv 0.2.0", stderr: "" });
      return {} as any;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockWhisperOutput));

    const result = await transcribeVideo(mockVideo, mockConfig);

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].start).toBe(0);
    expect(result.segments[0].end).toBe(0);
    expect(result.segments[0].text).toBe("");
    expect(result.segments[1].text).toBe("Some text");

    expect(result.words).toHaveLength(1);
    expect(result.words[0].word).toBe("");
    expect(result.words[0].start).toBe(0);
  });
});
