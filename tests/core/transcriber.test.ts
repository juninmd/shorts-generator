import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { transcribeVideo } from "../../src/core/transcriber.js";
import type { DownloadedVideo, PipelineConfig } from "../../src/types.js";
import fs from "node:fs";
import http from "node:http";

vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

vi.mock("node:http", () => ({
  default: { request: vi.fn() },
}));

describe("transcriber", () => {
  const mockConfig = {
    tempDir: "/tmp",
    whisperBaseUrl: "http://whisper.ai.svc.cluster.local:9000",
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
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("audio"));
  });

  it("requires cluster faster-whisper base URL", async () => {
    await expect(transcribeVideo(mockVideo, { ...mockConfig, whisperBaseUrl: "" })).rejects.toThrow(/WHISPER_BASE_URL is required/);
  });

  it("posts audio to faster-whisper and parses output", async () => {
    mockWhisperResponse({
      text: "Hello world.",
      language: "portuguese",
      segments: [
        { start: 0, end: 1, text: "Hello", words: [{ start: 0, end: 0.5, word: "Hello" }] },
        { start: 1, end: 2, text: "world.", words: [{ start: 1, end: 1.5, word: "world." }] },
      ],
    });

    const result = await transcribeVideo(mockVideo, mockConfig);

    expect(result.videoId).toBe("vid1");
    expect(result.fullText).toBe("Hello world.");
    expect(result.language).toBe("pt");
    expect(result.segments).toHaveLength(2);
    expect(result.words).toHaveLength(2);
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "whisper.ai.svc.cluster.local",
        path: "/asr?task=transcribe&language=pt&output=json&word_timestamps=True",
        method: "POST",
      }),
      expect.any(Function),
    );
  });

  it("handles missing segments and words safely", async () => {
    mockWhisperResponse({});

    const result = await transcribeVideo(mockVideo, mockConfig);

    expect(result.segments).toHaveLength(0);
    expect(result.words).toHaveLength(0);
    expect(result.language).toBe("pt");
  });
});

function mockWhisperResponse(body: unknown, errorOnFirstCall: boolean = false): void {
  vi.mocked(http.request).mockImplementation((options: any, callback?: any) => {
    const req = new EventEmitter() as any;
    req.write = vi.fn();
    req.end = vi.fn(() => {
      if (errorOnFirstCall && callCount === 1) {
        req.emit("error", Object.assign(new Error("fetch failed"), { name: "TimeoutError" }));
        return;
      }
      const res = new EventEmitter() as any;
      res.statusCode = 200;
      callback(res);
      res.emit("data", Buffer.from(JSON.stringify(body)));
      res.emit("end");
    });
    req.destroy = vi.fn();
    return req;
  });
}
