import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((...args) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') cb(null, { stdout: "", stderr: "" });
  }),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  const overrides = {
    mkdirSync: vi.fn(),
  };
  return {
    ...actual,
    ...overrides,
    default: {
      ...(actual.default || actual),
      ...overrides,
    },
  };
});

vi.mock("../../../src/core/ffmpeg-bin.js", () => ({ ffmpegBin: () => "ffmpeg" }));

import * as demoBooksFlash from "../../../src/core/comic/demo-books-flash.js";
import * as demoBooksShrek from "../../../src/core/comic/demo-books-shrek.js";
import * as demoBooksMisc from "../../../src/core/comic/demo-books-misc.js";
import * as demoBooksBarrel from "../../../src/core/comic/demo-books.js";

import {
  buildFlashpointDemoBook,
  buildShrek1DemoBook,
  buildFlashEpisode1DemoBook,
  buildBiographyDemoBook,
  buildNewsDigestDemoBook,
  buildBookRecapDemoBook
} from "../../../src/core/comic/demo-books.js";

import * as nodeFs from "node:fs";
import * as cp from "node:child_process";
import path from "node:path";

describe("demo-books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const tests = [
    { name: "buildFlashpointDemoBook", fn: buildFlashpointDemoBook, expectedId: "flashpoint-demo" },
    { name: "buildShrek1DemoBook", fn: buildShrek1DemoBook, expectedId: "shrek1-demo" },
    { name: "buildFlashEpisode1DemoBook", fn: buildFlashEpisode1DemoBook, expectedId: "flash-s01e01-demo" },
    { name: "buildBiographyDemoBook", fn: buildBiographyDemoBook, expectedId: "ada-lovelace-demo" },
    { name: "buildNewsDigestDemoBook", fn: buildNewsDigestDemoBook, expectedId: "news-digest-demo" },
    { name: "buildBookRecapDemoBook", fn: buildBookRecapDemoBook, expectedId: "dom-casmurro-demo" },
  ];

  for (const { name, fn, expectedId } of tests) {
    it(`${name} returns a properly formatted ComicBook`, async () => {
      const book = await fn("/workdir");
      expect(book.id).toBe(expectedId);
      expect(book.chapters.length).toBe(3);
      expect(book.chapters[0].imagePath).toBe(path.join("/workdir", "ch1.png"));
      expect(nodeFs.mkdirSync).toHaveBeenCalledWith("/workdir", { recursive: true });
      expect(cp.execFile).toHaveBeenCalled();
    });
  }

  it("should re-export verified functions correctly", () => {
    expect(demoBooksBarrel.buildFlashpointDemoBook).toBe(demoBooksFlash.buildFlashpointDemoBook);
    expect(demoBooksBarrel.buildFlashEpisode1DemoBook).toBe(demoBooksFlash.buildFlashEpisode1DemoBook);
    expect(demoBooksBarrel.buildShrek1DemoBook).toBe(demoBooksShrek.buildShrek1DemoBook);
    expect(demoBooksBarrel.buildBiographyDemoBook).toBe(demoBooksMisc.buildBiographyDemoBook);
    expect(demoBooksBarrel.buildNewsDigestDemoBook).toBe(demoBooksMisc.buildNewsDigestDemoBook);
    expect(demoBooksBarrel.buildBookRecapDemoBook).toBe(demoBooksMisc.buildBookRecapDemoBook);
  });
});
