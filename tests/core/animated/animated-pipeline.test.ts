import { describe, it, expect, vi, beforeEach } from "vitest";
import { captionFreeSubtitles, runAnimatedPipeline } from "../../../src/core/animated/animated-pipeline.js";
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
    { id: "c1", title: "Um", imagePath: "", narrationText: "um", heading: "Um", beats: [{ at: 0, pose: "talk" }] },
    { id: "c2", title: "Dois", imagePath: "", narrationText: "dois", heading: "Dois", beats: [{ cue: "dois", prop: "database" }] },
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

  it("defaults to the pop style and keys the output by style so both renders can coexist", async () => {
    const result = await runAnimatedPipeline(book, config);

    expect(renderStickPoster).toHaveBeenCalledTimes(2);
    expect(vi.mocked(renderStickPoster).mock.calls[0]![1]).toBe("pop");
    const [comicBook, comicConfig] = vi.mocked(runComicPipeline).mock.calls[0]!;
    expect(comicBook.id).toBe("b1-pop");
    expect(comicBook.chapters[0]!.imagePath).toContain("c1.poster.png");
    expect(comicConfig.buildSubtitles!({} as any)).toBe(captionFreeSubtitles(1080, 1920));
    expect(result).toEqual({ id: "r", outputPath: "o.mp4" });
  });

  it("uses the book style, and the config style over it", async () => {
    await runAnimatedPipeline({ ...book, style: "line" }, config);
    expect(vi.mocked(runComicPipeline).mock.calls[0]![0].id).toBe("b1-line");
    await runAnimatedPipeline({ ...book, style: "line" }, { ...config, style: "pop" });
    expect(vi.mocked(runComicPipeline).mock.calls[1]![0].id).toBe("b1-pop");
  });

  it("routes narration through the animated narrator and clips through the stick renderer", async () => {
    await runAnimatedPipeline(book, { ...config, style: "line" });
    const comicConfig = vi.mocked(runComicPipeline).mock.calls[0]![1];

    await comicConfig.narrate!([book.chapters[0]!] as any, "dir");
    expect(narrateAnimatedChapters).toHaveBeenCalledWith([book.chapters[0]], "dir", config.narration);

    const narrated = { id: "c2", audioPath: "", durationSec: 2, words: [] } as any;
    await comicConfig.renderChapter!(narrated, "clip.mp4");
    expect(renderStickClip).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c2", heading: "Dois" }),
      "line",
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

describe("captionFreeSubtitles", () => {
  it("is a valid ASS file with no dialogue events", () => {
    const ass = captionFreeSubtitles(1080, 1920);
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("[Events]");
    expect(ass).not.toContain("Dialogue:");
  });
});
