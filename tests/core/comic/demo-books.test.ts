import { describe, it, expect, vi } from "vitest";
import {
  buildFlashpointDemoBook,
  buildShrek1DemoBook,
  buildFlashEpisode1DemoBook,
  buildBiographyDemoBook,
  buildNewsDigestDemoBook,
  buildBookRecapDemoBook
} from "../../../src/core/comic/demo-books.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    let callback = cb;
    if (typeof opts === 'function') {
        callback = opts;
    }
    if (callback) callback(null, { stdout: "", stderr: "" });
  })
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn()
    },
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn()
  };
});

describe("demo-books", () => {
  it("generates a book for each demo", async () => {
    const flashpoint = await buildFlashpointDemoBook("test-dir");
    expect(flashpoint.id).toBe("flashpoint-demo");
    expect(flashpoint.chapters.length).toBeGreaterThan(0);

    const shrek = await buildShrek1DemoBook("test-dir");
    expect(shrek.id).toBe("shrek1-demo");
    expect(shrek.chapters.length).toBeGreaterThan(0);

    const flash = await buildFlashEpisode1DemoBook("test-dir");
    expect(flash.id).toBe("flash-s01e01-demo");
    expect(flash.chapters.length).toBeGreaterThan(0);

    const bio = await buildBiographyDemoBook("test-dir");
    expect(bio.id).toBe("ada-lovelace-demo");
    expect(bio.chapters.length).toBeGreaterThan(0);

    const news = await buildNewsDigestDemoBook("test-dir");
    expect(news.id).toBe("news-digest-demo");
    expect(news.chapters.length).toBeGreaterThan(0);

    const recap = await buildBookRecapDemoBook("test-dir");
    expect(recap.id).toBe("dom-casmurro-demo");
    expect(recap.chapters.length).toBeGreaterThan(0);
  });
});
