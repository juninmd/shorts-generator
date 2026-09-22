import fs from "node:fs";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/core/comic/comic-tts.js", () => ({
  narrateChapters: vi.fn(async (chapters: any[], _dir: string, _voice: string) =>
    chapters.map((chapter, index) => ({
      ...chapter,
      audioPath: `/tmp/${chapter.id}.mp3`,
      durationSec: 2 + index,
      words: [{ word: chapter.title, start: 0, end: 1 }],
    })),
  ),
}));

vi.mock("../../src/core/comic/comic-video.js", () => ({
  renderChapterClip: vi.fn(async () => {}),
  concatChapterClips: vi.fn(async () => {}),
  burnSubtitles: vi.fn(async () => {}),
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

import { runComicPipeline } from "../../src/core/comic/comic-pipeline.js";
import type { ComicBook } from "../../src/core/comic/comic-types.js";

describe("comic-pipeline", () => {
  const book: ComicBook = {
    id: "book-1",
    title: "Test Comic",
    chapters: [
      { id: "ch1", title: "Ch1", imagePath: "a.png", narrationText: "text one" },
      { id: "ch2", title: "Ch2", imagePath: "b.png", narrationText: "text two" },
    ],
  };

  it("stitches per-chapter durations into a single timeline and returns a result", async () => {
    const result = await runComicPipeline(book, {
      outputDir: "output",
      verticalWidth: 1080,
      verticalHeight: 1920,
      ttsVoice: "pt-BR-AntonioNeural",
    });

    // ch1 duration=2s, ch2 duration=3s (per the mocked narrator) → 5s total
    expect(result.durationSec).toBe(5);
    expect(result.chapters).toBe(2);
    expect(result.bookTitle).toBe("Test Comic");
    expect(result.outputPath).toContain("book-1.mp4");
  });

  it("rejects a book with no chapters", async () => {
    await expect(
      runComicPipeline({ id: "empty", title: "Empty", chapters: [] }, {
        outputDir: "output",
        verticalWidth: 1080,
        verticalHeight: 1920,
        ttsVoice: "pt-BR-AntonioNeural",
      }),
    ).rejects.toThrow("no chapters");
  });
});


  it("throws if chapter image is missing", async () => {
    const localBook = {
      id: "book-2",
      title: "Test Comic 2",
      chapters: [
        { id: "ch1", title: "Ch1", imagePath: "a.png", narrationText: "text one" }
      ],
    };
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);
    await expect(
      runComicPipeline(localBook, {
        outputDir: "output",
        verticalWidth: 1080,
        verticalHeight: 1920,
        ttsVoice: "pt-BR-AntonioNeural",
      }),
    ).rejects.toThrow(/Chapter image not found/);
  });
