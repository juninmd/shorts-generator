import { describe, it, expect, vi, beforeEach } from "vitest";
import * as demo from "../../../src/core/comic/demo-books.js";
import { execFile } from "node:child_process";
import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((...args) => { const cb = args[args.length - 1]; if (typeof cb === 'function') cb(null, { stdout: "", stderr: "" }); }),
}));

vi.mock("fluent-ffmpeg", () => ({
  default: {
    ffmpegPath: vi.fn(() => "/path/to/ffmpeg"),
  },
}));

vi.mock("node:fs", () => ({
    default: { mkdirSync: vi.fn(), existsSync: vi.fn(() => false) },
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false)
  }));

vi.mock("../../../src/core/ffmpeg-env.js", () => ({
  buildFontEnv: vi.fn(() => ({})),
}));

describe("demo-books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildFlashpointDemoBook should return correct ComicBook structure", async () => {
    const book = await demo.buildFlashpointDemoBook("/tmp");
    expect(book.id).toBe("flashpoint-demo");
    expect(book.chapters).toHaveLength(3);
    expect(execFile).toHaveBeenCalledTimes(3);
  });

  it("buildShrek1DemoBook should return correct ComicBook structure", async () => {
    const book = await demo.buildShrek1DemoBook("/tmp");
    expect(book.id).toBe("shrek1-demo");
    expect(book.chapters).toHaveLength(3);
  });

  it("buildFlashEpisode1DemoBook should return correct ComicBook structure", async () => {
    const book = await demo.buildFlashEpisode1DemoBook("/tmp");
    expect(book.id).toBe("flash-s01e01-demo");
    expect(book.chapters).toHaveLength(3);
  });

  it("buildBiographyDemoBook should return correct ComicBook structure", async () => {
    const book = await demo.buildBiographyDemoBook("/tmp");
    expect(book.id).toBe("ada-lovelace-demo");
    expect(book.chapters).toHaveLength(3);
  });

  it("buildNewsDigestDemoBook should return correct ComicBook structure", async () => {
    const book = await demo.buildNewsDigestDemoBook("/tmp");
    expect(book.id).toBe("news-digest-demo");
    expect(book.chapters).toHaveLength(3);
  });

  it("buildBookRecapDemoBook should return correct ComicBook structure", async () => {
    const book = await demo.buildBookRecapDemoBook("/tmp");
    expect(book.id).toBe("dom-casmurro-demo");
    expect(book.chapters).toHaveLength(3);
  });

  it("uses default ffmpeg string if ffmpegPath is missing", async () => {
      vi.mocked(ffmpeg.ffmpegPath).mockReturnValueOnce(undefined as any);
      await demo.buildFlashpointDemoBook("/tmp");
      expect(execFile).toHaveBeenCalled();
      const cmd = vi.mocked(execFile).mock.calls[0][0];
      expect(cmd).toBe("ffmpeg");
  });
});
