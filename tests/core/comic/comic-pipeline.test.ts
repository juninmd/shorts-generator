import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import * as comicTts from "../../../src/core/comic/comic-tts.js";
import * as comicVideo from "../../../src/core/comic/comic-video.js";
import * as subtitle from "../../../src/core/subtitle.js";
import { runComicPipeline } from "../../../src/core/comic/comic-pipeline.js";

vi.mock("node:fs");
vi.mock("../../../src/core/comic/comic-tts.js");
vi.mock("../../../src/core/comic/comic-video.js");
vi.mock("../../../src/core/subtitle.js");

describe("comic-pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);
  });

  const mockBook = {
    id: "book1",
    title: "Test Book",
    chapters: [
      { id: "ch1", title: "Chapter 1", imagePath: "ch1.png", narrationText: "Text 1" },
      { id: "ch2", title: "Chapter 2", imagePath: "ch2.png", narrationText: "Text 2" },
    ],
  };

  const mockConfig = {
    outputDir: "/tmp",
    verticalWidth: 1080,
    verticalHeight: 1920,
    ttsVoice: "voice",
  };

  it("throws if no chapters", async () => {
    await expect(runComicPipeline({ ...mockBook, chapters: [] }, mockConfig))
      .rejects.toThrow("Comic book has no chapters to narrate");
  });

  it("throws if chapter image not found", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValueOnce(false);
    await expect(runComicPipeline(mockBook, mockConfig))
      .rejects.toThrow("Chapter image not found: ch1.png");
  });

  it("runs pipeline successfully", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    vi.mocked(comicTts.narrateChapters).mockResolvedValue([
      { ...mockBook.chapters[0], audioPath: "ch1.mp3", durationSec: 5, words: [{ word: "Text", start: 0, end: 1 }] },
      { ...mockBook.chapters[1], audioPath: "ch2.mp3", durationSec: 5, words: [{ word: "Text", start: 0, end: 1 }] },
    ]);

    vi.mocked(comicVideo.renderChapterClip).mockResolvedValue();
    vi.mocked(comicVideo.concatChapterClips).mockResolvedValue();
    vi.mocked(comicVideo.burnSubtitles).mockResolvedValue();
    vi.mocked(subtitle.generateASSSubtitles).mockReturnValue("ass-content");

    const result = await runComicPipeline(mockBook, mockConfig);

    expect(result.bookTitle).toBe("Test Book");
    expect(result.durationSec).toBe(10);
    expect(result.chapters).toBe(2);
    expect(comicTts.narrateChapters).toHaveBeenCalled();
    expect(comicVideo.renderChapterClip).toHaveBeenCalledTimes(2);
    expect(comicVideo.concatChapterClips).toHaveBeenCalled();
    expect(comicVideo.burnSubtitles).toHaveBeenCalled();
    expect(subtitle.generateASSSubtitles).toHaveBeenCalled();
  });
});
