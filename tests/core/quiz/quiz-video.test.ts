import { describe, it, expect, vi, beforeEach } from "vitest";
import { assembleVideo } from "../../../src/core/quiz/quiz-video.service.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as child_process from "node:child_process";
import * as assetsService from "../../../src/core/quiz/quiz-assets.service.js";
import * as filterService from "../../../src/core/quiz/quiz-filters.service.js";
import * as ffmpegService from "../../../src/core/quiz/quiz-ffmpeg.service.js";
import { logger } from "../../../src/core/logger.js";
import type { PipelineConfig } from "../../../src/types.js";

vi.mock("node:fs");
vi.mock("node:child_process");
vi.mock("../../../src/core/quiz/quiz-assets.service.js");
vi.mock("../../../src/core/quiz/quiz-filters.service.js");
vi.mock("../../../src/core/quiz/quiz-ffmpeg.service.js");
vi.mock("../../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("quiz-video.service", () => {
  const mockQuiz = {
    tema: "T", pergunta: "Q?", opcoes: { A: "1", B: "2", C: "3", D: "4" },
    correta: "A", explicacao: "E"
  } as any;
  const mockAudioData = { qPath: "q.mp3", aPath: "a.mp3", qWords: [], aWords: [] };
  const mockConfig: PipelineConfig = { watermarkText: "@test" } as PipelineConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assetsService.normalizePath).mockImplementation((p) => p.replace(/\\/g, '/'));
    vi.mocked(assetsService.ensureFont).mockReturnValue("font.ttf");
    vi.mocked(assetsService.prepareBackground).mockReturnValue("bg.mp4");
    vi.mocked(assetsService.prepareTextFiles).mockReturnValue({ qTxtPath: "q.txt", optTxtPaths: { A: "a.txt" } });
    vi.mocked(filterService.generateFilters).mockReturnValue({ ffmpegInputs: [], filterComplex: "filter" });
    vi.mocked(ffmpegService.runFFmpeg).mockResolvedValue(undefined);
  });

  it("should assemble video successfully with default watermark", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false); // tempDir doesn't exist initially, music dir doesn't exist
    vi.mocked(child_process.spawnSync).mockReturnValue({ stdout: Buffer.from("10.5\n") } as any); // ffprobe

    const result = await assembleVideo(mockQuiz, mockAudioData, "out.mp4", "temp", {} as PipelineConfig);

    expect(result).toBe("out.mp4");
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("temp"), { recursive: true });
    expect(child_process.spawnSync).toHaveBeenCalledTimes(2); // qDur, aDur
    expect(filterService.generateFilters).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      false, false, false, "", expect.anything(), expect.anything(), "@akitemquiz" // Default watermark
    );
    expect(ffmpegService.runFFmpeg).toHaveBeenCalledWith([], "filter", "out.mp4", 10.5 + 10.5 + 5);
  });

  it("should use provided watermark and handle music selection", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p.toString().includes("temp_assets")) return true;
        if (p.toString().includes("music") && !p.toString().includes("beep.mp3")) return true; // music dir exists
        return false;
    });
    vi.mocked(fs.readdirSync).mockReturnValue(["background1.mp3", "other.txt"] as any);
    vi.mocked(child_process.spawnSync).mockReturnValue({ stdout: Buffer.from("5\n") } as any);

    vi.spyOn(Math, "random").mockReturnValue(0); // Select first music file

    await assembleVideo(mockQuiz, mockAudioData, "out.mp4", "temp_assets", mockConfig);

    expect(filterService.generateFilters).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), 5, expect.anything(), expect.anything(), expect.anything(),
      true, false, false, expect.stringContaining("background1.mp3"), expect.anything(), expect.anything(), "@test"
    );

    vi.spyOn(Math, "random").mockRestore();
  });

  it("should throw error and log it if ffmpeg fails", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(child_process.spawnSync).mockReturnValue({ stdout: Buffer.from("5\n") } as any);
    vi.mocked(ffmpegService.runFFmpeg).mockRejectedValue(new Error("FFmpeg Failed"));

    await expect(assembleVideo(mockQuiz, mockAudioData, "out.mp4", "temp_assets", mockConfig)).rejects.toThrow("FFmpeg Failed");
    expect(logger.error).toHaveBeenCalledWith({ error: "FFmpeg Failed" }, expect.anything());
  });

  it("should not use music if music folder is empty of valid files", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p.toString().includes("beep.mp3")) return true; // mock beep existing
        if (p.toString().includes("logo.png")) return true; // mock logo existing
        if (p.toString().includes("music")) return false; // mock music not existing
        return true; // tempDir exists
    });
    vi.mocked(fs.readdirSync).mockReturnValue(["not_background.mp3"] as any);
    vi.mocked(child_process.spawnSync).mockReturnValue({ stdout: Buffer.from("5\n") } as any);

    await assembleVideo(mockQuiz, mockAudioData, "out.mp4", "temp", mockConfig);

     expect(filterService.generateFilters).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(), 5, expect.anything(), expect.anything(), expect.anything(),
      false, true, true, "", expect.anything(), expect.anything(), "@test"
    );
  });
});
