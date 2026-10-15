import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runComicCommand, StoryKind } from "../../src/cli-commands/cli-comic.js";
import { loadConfig } from "../../src/core/config.js";
import { runComicPipeline } from "../../src/core/comic/comic-pipeline.js";
import { logger } from "../../src/core/logger.js";
import fs from "node:fs";
import * as demoBooks from "../../src/core/comic/demo-books.js";
import path from "node:path";

vi.mock("node:fs");
vi.mock("../../src/core/config.js");
vi.mock("../../src/core/comic/comic-pipeline.js");
vi.mock("../../src/core/comic/demo-books.js");
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

describe("cli-comic", () => {
  let exitSpy: any;
  let consoleSpy: any;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.mocked(loadConfig).mockReturnValue({ tempDir: "temp", outputDir: "out", verticalWidth: 1080, verticalHeight: 1920 } as any);
    vi.mocked(runComicPipeline).mockResolvedValue({ outputPath: "out.mp4", durationSec: 10, chapters: 2 } as any);
    vi.mocked(demoBooks.buildFlashpointDemoBook).mockResolvedValue({} as any);
    vi.mocked(demoBooks.buildShrek1DemoBook).mockResolvedValue({} as any);
    vi.mocked(demoBooks.buildFlashEpisode1DemoBook).mockResolvedValue({} as any);
    vi.mocked(demoBooks.buildBiographyDemoBook).mockResolvedValue({} as any);
    vi.mocked(demoBooks.buildNewsDigestDemoBook).mockResolvedValue({} as any);
    vi.mocked(demoBooks.buildBookRecapDemoBook).mockResolvedValue({} as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ title: "test book" }));

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it.each([
    ["comic", demoBooks.buildFlashpointDemoBook],
    ["movie", demoBooks.buildShrek1DemoBook],
    ["series", demoBooks.buildFlashEpisode1DemoBook],
    ["bio", demoBooks.buildBiographyDemoBook],
    ["news", demoBooks.buildNewsDigestDemoBook],
    ["book", demoBooks.buildBookRecapDemoBook]
  ])("should run with demo %s", async (kind, builderMock) => {
    await runComicCommand(kind as StoryKind, ["--demo"]);
    expect(builderMock).toHaveBeenCalled();
    expect(runComicPipeline).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.anything(), `generate:${kind} completed`);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Short gerado: out.mp4"));
  });

  it("should run with specified book json file", async () => {
    await runComicCommand("comic", ["--book", "book.json"]);
    expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve("book.json"), "utf-8");
    expect(runComicPipeline).toHaveBeenCalled();
  });

  it("should use env vars for tts and watermark", async () => {
    process.env.COMIC_TTS_VOICE = "voice";
    process.env.COMIC_WATERMARK_TEXT = "watermark";
    await runComicCommand("comic", ["--demo"]);
    expect(runComicPipeline).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ttsVoice: "voice", watermarkText: "watermark" }));
  });

  it("should exit if neither --demo nor --book is provided", async () => {
    exitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); });
    await expect(runComicCommand("comic", [])).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
  });
});
