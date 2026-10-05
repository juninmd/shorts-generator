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
      expect(book.chapters[0].imagePath).toContain("/workdir");
      expect(nodeFs.mkdirSync).toHaveBeenCalledWith("/workdir", { recursive: true });
      expect(cp.execFile).toHaveBeenCalled();
    });
  }
});
