import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupComicMocks } from './comic-test-utils.js';
setupComicMocks();


import * as demoBooks from "../../../src/core/comic/demo-books.js";
import { execFile } from "node:child_process";

describe("demo-books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, { stdout: "", stderr: "" });
    });
  });

  const testCases = [
    { fn: 'buildFlashpointDemoBook', id: 'flashpoint-demo', chapters: 3 },
    { fn: 'buildShrek1DemoBook', id: 'shrek1-demo', chapters: 3 },
    { fn: 'buildFlashEpisode1DemoBook', id: 'flash-s01e01-demo', chapters: 3 },
    { fn: 'buildBiographyDemoBook', id: 'ada-lovelace-demo', chapters: 3 },
    { fn: 'buildNewsDigestDemoBook', id: 'news-digest-demo', chapters: 3 },
    { fn: 'buildBookRecapDemoBook', id: 'dom-casmurro-demo', chapters: 3 },
  ];

  it.each(testCases)("$fn works", async ({ fn, id, chapters }) => {
    const book = await (demoBooks as any)[fn]("workdir");
    expect(book.id).toBe(id);
    expect(book.chapters).toHaveLength(chapters);
  });
});
