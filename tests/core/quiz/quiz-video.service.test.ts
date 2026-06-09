import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assembleVideo } from "../../../src/core/quiz/quiz-video.service";
import { ensureFont, prepareBackground, prepareTextFiles, normalizePath } from "../../../src/core/quiz/quiz-assets.service";
import { generateFilters } from "../../../src/core/quiz/quiz-filters.service";
import { runFFmpeg } from "../../../src/core/quiz/quiz-ffmpeg.service";
import { logger } from "../../../src/core/logger";

vi.mock("node:child_process");
vi.mock("node:fs");
vi.mock("../../../src/core/quiz/quiz-assets.service");
vi.mock("../../../src/core/quiz/quiz-filters.service");
vi.mock("../../../src/core/quiz/quiz-ffmpeg.service");
vi.mock("../../../src/core/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Quiz Video Service", () => {
  const mockQuiz = {
    tema: "test theme",
    pergunta: "Test Question?",
    opcoes: { A: "1", B: "2", C: "3", D: "4" },
    resposta_correta: "A" as const,
    fato_curioso: "Test Fact"
  };

  const audioData = {
    qPath: "q.mp3",
    aPath: "a.mp3",
    qWords: [],
    aWords: []
  };

  const config = {
    watermarkText: "@testmark"
  } as any;

  beforeEach(() => {
    vi.resetAllMocks();

    vi.spyOn(Math, "random").mockReturnValue(0); // For music array deterministic selection

    vi.mocked(normalizePath).mockImplementation((p) => p.replace(/\\/g, "/"));
    vi.mocked(ensureFont).mockReturnValue("font.ttf");
    vi.mocked(prepareBackground).mockReturnValue("bg.mp4");
    vi.mocked(prepareTextFiles).mockReturnValue({ qTxtPath: "q.txt", optTxtPaths: {} });
    vi.mocked(generateFilters).mockReturnValue({ ffmpegInputs: [], filterComplex: "filter" });
    vi.mocked(runFFmpeg).mockResolvedValue();

    vi.mocked(spawnSync).mockImplementation((cmd, args) => {
      if (cmd === "ffprobe") {
        return { stdout: Buffer.from("10.0\n") } as any;
      }
      return {} as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should assemble video successfully with all assets", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const ps = p.toString();
      if (ps.includes("temp_assets")) return true;
      if (ps.includes("assets/music") && !ps.endsWith(".mp3")) return true; // music dir
      if (ps.includes("background") && ps.endsWith(".mp3")) return true; // music path
      if (ps.includes("beep.mp3")) return true;
      if (ps.includes("logo.png")) return true;
      return false;
    });

    vi.mocked(fs.readdirSync).mockReturnValue(["background1.mp3", "other.txt"] as any);

    const res = await assembleVideo(mockQuiz, audioData, "out.mp4", "temp_assets", config);

    expect(res).toBe("out.mp4");
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(generateFilters).toHaveBeenCalledWith(
      mockQuiz, "bg.mp4", "q.mp3", "a.mp3", 10, "font.ttf", "q.txt", {},
      true, true, true, expect.stringContaining("background1.mp3"), expect.stringContaining("beep.mp3"), expect.stringContaining("logo.png"), "@testmark"
    );
    expect(runFFmpeg).toHaveBeenCalledWith([], "filter", "out.mp4", 10 + 10 + 5); // qDur+aDur+5
  });

  it("should assemble video successfully when tempDir does not exist", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const ps = p.toString();
      if (ps.includes("temp_assets")) return false; // trigger mkdirSync
      return false;
    });
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    await assembleVideo(mockQuiz, audioData, "out.mp4", "temp_assets", config);

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("temp_assets"), { recursive: true });
  });

  it("should assemble video successfully without music/beep/logo", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false); // nothing exists

    // override the first fs.existsSync for tempDir to return true so we don't test mkdirSync again
    vi.mocked(fs.existsSync).mockImplementationOnce(() => true);

    await assembleVideo(mockQuiz, audioData, "out.mp4", "temp_assets", config);

    expect(generateFilters).toHaveBeenCalledWith(
      mockQuiz, "bg.mp4", "q.mp3", "a.mp3", 10, "font.ttf", "q.txt", {},
      false, false, false, "", expect.stringContaining("beep.mp3"), expect.stringContaining("logo.png"), "@testmark"
    );
  });

  it("should assemble video successfully when music folder exists but is empty", async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const ps = p.toString();
      if (ps.includes("assets/music") && !ps.endsWith(".mp3")) return true; // music dir exists
      return true; // everything else exists to avoid mkdirSync
    });
    vi.mocked(fs.readdirSync).mockReturnValue([]); // empty dir

    await assembleVideo(mockQuiz, audioData, "out.mp4", "temp_assets", config);

    expect(generateFilters).toHaveBeenCalledWith(
      mockQuiz, "bg.mp4", "q.mp3", "a.mp3", 10, "font.ttf", "q.txt", {},
      false, true, true, "", expect.stringContaining("beep.mp3"), expect.stringContaining("logo.png"), "@testmark"
    );
  });

  it("should assemble video successfully with default watermark if config missing", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    await assembleVideo(mockQuiz, audioData, "out.mp4", "temp_assets", {} as any);

    expect(generateFilters).toHaveBeenCalledWith(
      mockQuiz, "bg.mp4", "q.mp3", "a.mp3", 10, "font.ttf", "q.txt", {},
      false, true, true, "", expect.stringContaining("beep.mp3"), expect.stringContaining("logo.png"), "@akitemquiz"
    );
  });

  it("should handle ffmpeg run failure and rethrow", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(runFFmpeg).mockRejectedValue(new Error("FFmpeg Failed"));

    await expect(assembleVideo(mockQuiz, audioData, "out.mp4", "temp_assets", config)).rejects.toThrow("FFmpeg Failed");
    expect(logger.error).toHaveBeenCalledWith({ error: "FFmpeg Failed" }, expect.any(String));
  });
});
