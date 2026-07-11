import { describe, it, expect, vi, beforeEach } from "vitest";
import { assembleVideo } from "../../../src/core/quiz/quiz-video.service.js";
import * as domain from "../../../src/core/quiz/quiz.domain.js";
import * as assets from "../../../src/core/quiz/quiz-assets.service.js";
import * as filters from "../../../src/core/quiz/quiz-filters.service.js";
import * as ffmpeg from "../../../src/core/quiz/quiz-ffmpeg.service.js";
import fs from "node:fs";
import child_process from "node:child_process";
import path from "node:path";

vi.mock("node:fs");
vi.mock("node:child_process");
vi.mock("../../../src/core/quiz/quiz.domain.js");
vi.mock("../../../src/core/quiz/quiz-assets.service.js");
vi.mock("../../../src/core/quiz/quiz-filters.service.js");
vi.mock("../../../src/core/quiz/quiz-ffmpeg.service.js");
vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

describe("quiz-video.service", () => {
  const validQuiz = {
    tema: "test",
    titulo_youtube: "title",
    hook: "hook text",
    perguntas: [
      { pergunta: "P1?", opcoes: { A: "a", B: "b", C: "c", D: "d" }, resposta_correta: "A" }
    ],
    fato_curioso: "curious fact",
    tags: ["test"],
  };

  const narrations = {
    questionAudioPaths: ["q1.mp3"],
    answerAudioPaths: ["a1.mp3"],
    outroAudioPath: "outro.mp3"
  };

  const config = { watermarkText: "test" } as any;

  beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["background.mp3"] as any);

    vi.mocked(child_process.spawnSync).mockReturnValue({
        stdout: Buffer.from("10.5")
    } as any);

    vi.mocked(domain.buildTimeline).mockReturnValue({
      total: 10,
      questions: [],
      outroStart: 5
    });

    vi.mocked(assets.ensureFont).mockReturnValue("font.ttf");
    vi.mocked(assets.prepareBackground).mockReturnValue("bg.mp4");
    vi.mocked(assets.prepareTextFiles).mockReturnValue({
      questions: [],
      outroTxtPath: "outro.txt",
      hookTxtPath: "hook.txt"
    });
    vi.mocked(assets.normalizePath).mockImplementation((p) => p);

    vi.mocked(filters.generateFilters).mockReturnValue({
      ffmpegInputs: [],
      filterComplex: "filter"
    });

    vi.mocked(ffmpeg.runFFmpeg).mockResolvedValue();
  });

  it("assembles a video successfully", async () => {
    // Need to use the exact mock path or let it return false for the specific argument
    vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p.toString() === path.resolve("temp")) return false; // trigger mkdirSync
        return true;
    });

    const outputPath = await assembleVideo(validQuiz, narrations, "out.mp4", "temp", config);

    expect(outputPath).toBe("out.mp4");
    expect(fs.mkdirSync).toHaveBeenCalledWith(path.resolve("temp"), { recursive: true });
    expect(ffmpeg.runFFmpeg).toHaveBeenCalled();
  });

  it("throws error if ffprobe fails to measure duration", async () => {
    vi.mocked(child_process.spawnSync).mockReturnValue({
        stdout: Buffer.from("invalid")
    } as any);

    await expect(assembleVideo(validQuiz, narrations, "out.mp4", "temp", config))
      .rejects.toThrow("ffprobe não conseguiu medir a duração de q1.mp3");
  });

  it("handles missing music gracefully", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
          if (p.toString().includes("assets/music")) return false;
          return true;
      });

      const outputPath = await assembleVideo(validQuiz, narrations, "out.mp4", "temp", config);
      expect(outputPath).toBe("out.mp4");
  });

  it("selects music if available in directory", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p.toString().includes("temp_assets")) return false;
        if (p.toString() === path.resolve("assets/music")) return true;
        return true; // default
    });
    vi.mocked(fs.readdirSync).mockReturnValue(["background1.mp3", "other.txt"] as any);

    const outputPath = await assembleVideo(validQuiz, narrations, "out.mp4", "temp", config);
    expect(outputPath).toBe("out.mp4");
  });

  it("uses fallback watermarkText", async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => true);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any); // no music files
    const configNoWatermark = {} as any;
    const outputPath = await assembleVideo(validQuiz, narrations, "out.mp4", "temp", configNoWatermark);
    expect(outputPath).toBe("out.mp4");

    // Check fallback was passed down to filters
    expect(filters.generateFilters).toHaveBeenCalled();
    const args = vi.mocked(filters.generateFilters).mock.calls[0][2];
    expect(args.watermarkText).toBe("@akitemquiz");
  });
});
