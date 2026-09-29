import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    let callback = cb;
    if (!callback && typeof opts === "function") callback = opts;
    if (!callback && args && typeof args[args.length - 1] === "function") callback = args[args.length - 1];

    if (callback) {
      callback(null, { stdout: "", stderr: "" });
    }
  }),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("fluent-ffmpeg", () => ({
  default: {
    ffmpegPath: vi.fn(() => "mock-ffmpeg"),
  },
}));

vi.mock("../../../src/core/ffmpeg-env.js", () => ({
  buildFontEnv: vi.fn(() => ({ FONTCONFIG_PATH: "/test" })),
}));

import {
  buildFlashpointDemoBook,
  buildShrek1DemoBook,
  buildFlashEpisode1DemoBook,
  buildBiographyDemoBook,
  buildNewsDigestDemoBook,
  buildBookRecapDemoBook,
} from "../../../src/core/comic/demo-books.js";

import ffmpeg from "fluent-ffmpeg";
describe("demo-books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildFlashpointDemoBook works", async () => {
    const book = await buildFlashpointDemoBook("/tmp");
    expect(book.id).toBe("flashpoint-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("buildShrek1DemoBook works", async () => {
    const book = await buildShrek1DemoBook("/tmp");
    expect(book.id).toBe("shrek1-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("buildFlashEpisode1DemoBook works", async () => {
    const book = await buildFlashEpisode1DemoBook("/tmp");
    expect(book.id).toBe("flash-s01e01-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("buildBiographyDemoBook works", async () => {
    const book = await buildBiographyDemoBook("/tmp");
    expect(book.id).toBe("ada-lovelace-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("buildNewsDigestDemoBook works", async () => {
    const book = await buildNewsDigestDemoBook("/tmp");
    expect(book.id).toBe("news-digest-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("buildBookRecapDemoBook works", async () => {
    const book = await buildBookRecapDemoBook("/tmp");
    expect(book.id).toBe("dom-casmurro-demo");
    expect(book.chapters.length).toBe(3);
  });

  it("getFfmpegPath fallback to ffmpeg", async () => {
    vi.mocked(ffmpeg.ffmpegPath).mockReturnValueOnce(undefined);
    await buildFlashpointDemoBook("/tmp");
  });

});
