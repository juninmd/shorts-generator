import { describe, it, expect, vi } from "vitest";
import {
  splitAudioIntoChunks,
  mergeWhisperOutputs,
  cleanupChunkFiles,
  type WhisperOutput
} from "../../src/core/audio-chunker.js";
import fs from "node:fs";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, options, cb) => cb(null, { stdout: "", stderr: "" }))
}));

describe("audio-chunker", () => {
  it("splitAudioIntoChunks splits audio file properly using ffmpeg", async () => {
    const result = await splitAudioIntoChunks("test.wav", 10 * 60, 5 * 60, "outDir");
    expect(result).toHaveLength(2);
    expect(result[0].offsetSec).toBe(0);
    expect(result[1].offsetSec).toBe(300);
  });

  it("mergeWhisperOutputs applies correct offsets to segments and words", () => {
    const chunks = [
      {
        data: {
          text: "Hello ",
          language: "en",
          segments: [
            { start: 0, end: 1, text: "Hello", words: [{ word: "Hello", start: 0, end: 1 }] }
          ]
        } as WhisperOutput,
        offsetSec: 0
      },
      {
        data: {
          text: "World",
          language: "en",
          segments: [
            { start: 0, end: 1, text: "World", words: [{ word: "World", start: 0, end: 1 }] }
          ]
        } as WhisperOutput,
        offsetSec: 300
      }
    ];

    const merged = mergeWhisperOutputs(chunks);
    expect(merged.text).toBe("Hello World");
    expect(merged.language).toBe("en");
    expect(merged.segments).toHaveLength(2);
    expect(merged.segments[1].start).toBe(300);
    expect(merged.segments[1].end).toBe(301);
    expect(merged.segments[1].words![0].start).toBe(300);
    expect(merged.segments[1].words![0].end).toBe(301);
  });

  it("mergeWhisperOutputs handles missing words array", () => {
    const chunks = [{
      data: {
        text: "Test",
        language: "pt",
        segments: [{ start: 5, end: 10, text: "Test" }]
      } as WhisperOutput,
      offsetSec: 100
    }];

    const merged = mergeWhisperOutputs(chunks);
    expect(merged.segments[0].start).toBe(105);
    expect(merged.segments[0].end).toBe(110);
    expect(merged.segments[0].words).toBeUndefined();
  });

  it("mergeWhisperOutputs handles missing data language and missing segments", () => {
    const chunks = [{
      data: {
        text: "Test"
      } as WhisperOutput,
      offsetSec: 100
    }];

    const merged = mergeWhisperOutputs(chunks);
    expect(merged.language).toBe("pt");
    expect(merged.segments).toEqual([]);
  });

  it("cleanupChunkFiles deletes files without throwing errors", () => {
    const unlinkSpy = vi.spyOn(fs, "unlinkSync").mockImplementation(() => {
      throw new Error("Cannot delete");
    });

    expect(() => cleanupChunkFiles([{ path: "file1" }])).not.toThrow();
    unlinkSpy.mockRestore();
  });
});
