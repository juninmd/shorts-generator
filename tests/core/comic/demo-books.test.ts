import { describe, it, expect, vi, beforeEach } from "vitest";
import * as child_process from "node:child_process";
import fs from "node:fs";
import ffmpeg from "fluent-ffmpeg";
import {
  buildFlashpointDemoBook,
  buildShrek1DemoBook,
  buildFlashEpisode1DemoBook,
  buildBiographyDemoBook,
  buildNewsDigestDemoBook,
  buildBookRecapDemoBook
} from "../../../src/core/comic/demo-books.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("node:fs");
vi.mock("fluent-ffmpeg");

describe("demo-books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ffmpeg as any).ffmpegPath = vi.fn().mockReturnValue("mock-ffmpeg");
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.mocked(child_process.execFile).mockImplementation(((...args: any[]) => {
      const callback = args[args.length - 1];
      if (typeof callback === "function") {
        callback(null, { stdout: "ok", stderr: "" });
      }
      return {} as any;
    }) as any);
  });

  it("buildFlashpointDemoBook", async () => {
    const book = await buildFlashpointDemoBook("/tmp");
    expect(book.id).toBe("flashpoint-demo");
    expect(book.chapters.length).toBe(3);
    expect(child_process.execFile).toHaveBeenCalledTimes(3);
  });

  it("buildShrek1DemoBook", async () => {
    const book = await buildShrek1DemoBook("/tmp");
    expect(book.id).toBe("shrek1-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("buildFlashEpisode1DemoBook", async () => {
    const book = await buildFlashEpisode1DemoBook("/tmp");
    expect(book.id).toBe("flash-s01e01-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("buildBiographyDemoBook", async () => {
    const book = await buildBiographyDemoBook("/tmp");
    expect(book.id).toBe("ada-lovelace-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("buildNewsDigestDemoBook", async () => {
    const book = await buildNewsDigestDemoBook("/tmp");
    expect(book.id).toBe("news-digest-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("buildBookRecapDemoBook", async () => {
    const book = await buildBookRecapDemoBook("/tmp");
    expect(book.id).toBe("dom-casmurro-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("getFfmpegPath falls back to 'ffmpeg'", async () => {
    (ffmpeg as any).ffmpegPath = undefined;
    await buildBookRecapDemoBook("/tmp");
    expect(child_process.execFile).toHaveBeenCalledWith("ffmpeg", expect.any(Array), expect.any(Object), expect.any(Function));
  });
});
