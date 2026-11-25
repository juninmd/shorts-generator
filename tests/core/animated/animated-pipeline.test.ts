import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAnimatedPipeline } from "../../../src/core/animated/animated-pipeline.js";
import { runComicPipeline } from "../../../src/core/comic/comic-pipeline.js";
import { narrateAnimatedChapters } from "../../../src/core/animated/narration.js";
import { renderStickClip, renderStickPoster } from "../../../src/core/animated/stick-render.js";
import type { AnimatedBook } from "../../../src/core/animated/animated-types.js";

vi.mock("../../../src/core/comic/comic-pipeline.js", () => ({ runComicPipeline: vi.fn() }));
vi.mock("../../../src/core/animated/narration.js", () => ({ narrateAnimatedChapters: vi.fn() }));
vi.mock("../../../src/core/animated/stick-render.js", () => ({
  renderStickPoster: vi.fn(async () => {}),
  renderStickClip: vi.fn(async () => {}),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, mkdirSync: vi.fn() };
});

const book: AnimatedBook = {
  id: "b1",
  title: "Livro",
  chapters: [
    { id: "c1", title: "Um", imagePath: "", narrationText: "um", pose: "talk", prop: "none" },
    { id: "c2", title: "Dois", imagePath: "", narrationText: "dois", pose: "alarm", prop: "database" },
  ],
};
const config = {
  outputDir: "out",
  verticalWidth: 1080,
  verticalHeight: 1920,
  narration: { provider: "silent" as const, edgeVoice: "v" },
};

describe("runAnimatedPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runComicPipeline).mockResolvedValue({ id: "r", outputPath: "o.mp4" } as any);
  });

  it("rejects a size the stick layout was not drawn for", async () => {
    await expect(runAnimatedPipeline(book, { ...config, verticalWidth: 720 })).rejects.toThrow("need 1080x1920");
  });

  it("rejects a book with no chapters", async () => {
    await expect(runAnimatedPipeline({ ...book, chapters: [] }, config)).rejects.toThrow("no chapters");
  });

  it("renders a poster per chapter and hands them to the comic pipeline as stills", async () => {
    const result = await runAnimatedPipeline(book, config);

    expect(renderStickPoster).toHaveBeenCalledTimes(2);
    const [comicBook, comicConfig] = vi.mocked(runComicPipeline).mock.calls[0]!;
    expect(comicBook.chapters[0]!.imagePath).toContain("c1.poster.png");
    expect(comicBook.id).toBe("b1");
    expect(comicConfig.verticalWidth).toBe(1080);
    expect(result).toEqual({ id: "r", outputPath: "o.mp4" });
  });

  it("routes narration through the animated narrator and clips through the stick renderer", async () => {
    await runAnimatedPipeline(book, config);
    const comicConfig = vi.mocked(runComicPipeline).mock.calls[0]![1];

    await comicConfig.narrate!([book.chapters[0]!] as any, "dir");
    expect(narrateAnimatedChapters).toHaveBeenCalledWith([book.chapters[0]], "dir", config.narration);

    const narrated = { id: "c2", audioPath: "", durationSec: 2, words: [] } as any;
    await comicConfig.renderChapter!(narrated, "clip.mp4");
    expect(renderStickClip).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c2", pose: "alarm", prop: "database" }),
      narrated,
      "clip.mp4",
      expect.objectContaining({ width: 1080, height: 1920, fps: 30 }),
    );
  });

  it("refuses to render a chapter that is not part of the book", async () => {
    await runAnimatedPipeline(book, config);
    const comicConfig = vi.mocked(runComicPipeline).mock.calls[0]![1];
    await expect(comicConfig.renderChapter!({ id: "ghost" } as any, "x.mp4")).rejects.toThrow("Unknown animated chapter: ghost");
  });
});
