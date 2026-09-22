import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const overrides = {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
  return { ...actual, ...overrides, default: { ...(actual as any).default, ...overrides } };
});

import {
  buildFlashpointDemoBook,
  buildShrek1DemoBook,
  buildFlashEpisode1DemoBook,
  buildBiographyDemoBook,
  buildNewsDigestDemoBook,
  buildBookRecapDemoBook
} from "../../../src/core/comic/demo-books.js";
import { execFile } from "node:child_process";

describe("demo-books", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execFile).mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      cb(null, { stdout: "", stderr: "" });
    });
  });

  it("buildFlashpointDemoBook works", async () => {
    const book = await buildFlashpointDemoBook("workdir");
    expect(book.id).toBe("flashpoint-demo");
    expect(book.chapters).toHaveLength(3);
  });

  it("buildShrek1DemoBook works", async () => {
    const book = await buildShrek1DemoBook("workdir");
    expect(book.id).toBe("shrek1-demo");
  });

  it("buildFlashEpisode1DemoBook works", async () => {
    const book = await buildFlashEpisode1DemoBook("workdir");
    expect(book.id).toBe("flash-s01e01-demo");
  });

  it("buildBiographyDemoBook works", async () => {
    const book = await buildBiographyDemoBook("workdir");
    expect(book.id).toBe("ada-lovelace-demo");
  });

  it("buildNewsDigestDemoBook works", async () => {
    const book = await buildNewsDigestDemoBook("workdir");
    expect(book.id).toBe("news-digest-demo");
  });

  it("buildBookRecapDemoBook works", async () => {
    const book = await buildBookRecapDemoBook("workdir");
    expect(book.id).toBe("dom-casmurro-demo");
  });
});
