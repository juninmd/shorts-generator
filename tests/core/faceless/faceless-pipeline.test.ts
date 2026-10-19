import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildFacelessBook, runFacelessPipeline } from "../../../src/core/faceless/faceless-pipeline.js";
import { generateFacelessScript } from "../../../src/core/faceless/faceless-script.js";
import { fetchSceneFootage } from "../../../src/core/faceless/stock-footage.js";
import { buildColorCardBook } from "../../../src/core/comic/demo-books-utils.js";
import { runComicPipeline } from "../../../src/core/comic/comic-pipeline.js";

vi.mock("../../../src/core/faceless/faceless-script.js");
vi.mock("../../../src/core/faceless/stock-footage.js");
vi.mock("../../../src/core/comic/demo-books-utils.js");
vi.mock("../../../src/core/comic/comic-pipeline.js");
vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn() } }));

const script = {
  title: "Buracos negros",
  scenes: [
    { narration: "Um", keywords: "galaxy" },
    { narration: "Dois", keywords: "stars" },
  ],
};

describe("faceless pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildColorCardBook).mockImplementation(async (_dir, id, title, chapters) => ({
      id, title, chapters: chapters.map((c) => ({ ...c, imagePath: `${c.id}.png` })),
    }));
  });

  it("uses stock footage per scene and keeps color cards as the fallback", async () => {
    vi.mocked(fetchSceneFootage)
      .mockResolvedValueOnce("/w/scene1.mp4")
      .mockResolvedValueOnce(null);
    const book = await buildFacelessBook(script, "/w", "KEY");
    expect(book.id).toMatch(/^faceless-/);
    expect(book.title).toBe("Buracos negros");
    expect(book.chapters.map((c) => c.videoPath)).toEqual(["/w/scene1.mp4", undefined]);
    expect(book.chapters.map((c) => c.imagePath)).toEqual(["scene1.png", "scene2.png"]);
    expect(book.chapters[0]!.narrationText).toBe("Um");
    expect(fetchSceneFootage).toHaveBeenNthCalledWith(1, "galaxy", expect.stringContaining("scene1.mp4"), "KEY", expect.any(Set));
  });

  it("shares one used-footage set so scenes never repeat a clip", async () => {
    vi.mocked(fetchSceneFootage).mockResolvedValue(null);
    await buildFacelessBook(script, "/w");
    const [first, second] = vi.mocked(fetchSceneFootage).mock.calls;
    expect(first![3]).toBe(second![3]);
  });

  it("runs script → book → narrated short with music and watermark", async () => {
    vi.mocked(generateFacelessScript).mockResolvedValue(script);
    vi.mocked(fetchSceneFootage).mockResolvedValue(null);
    vi.mocked(runComicPipeline).mockResolvedValue({ outputPath: "o.mp4" } as any);
    const config = { tempDir: "/t", outputDir: "/o", verticalWidth: 1080, verticalHeight: 1920 } as any;
    const result = await runFacelessPipeline("buracos negros", config, {
      ttsVoice: "v", language: "pt-BR", pexelsApiKey: "KEY", musicPath: "bgm.mp3", watermarkText: "wm",
    });
    expect(result).toEqual({ outputPath: "o.mp4" });
    expect(generateFacelessScript).toHaveBeenCalledWith("buracos negros", config, "pt-BR");
    expect(runComicPipeline).toHaveBeenCalledWith(expect.objectContaining({ title: "Buracos negros" }), {
      outputDir: "/o", verticalWidth: 1080, verticalHeight: 1920, ttsVoice: "v", watermarkText: "wm", musicPath: "bgm.mp3",
    });
  });
});
