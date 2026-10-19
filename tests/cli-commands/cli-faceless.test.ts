import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runFacelessCommand } from "../../src/cli-commands/cli-faceless.js";
import { runFacelessPipeline } from "../../src/core/faceless/faceless-pipeline.js";
import { pickBackgroundMusic } from "../../src/core/audio-ducking.js";

vi.mock("../../src/core/config.js", () => ({ loadConfig: vi.fn(() => ({ cfg: true })) }));
vi.mock("../../src/core/faceless/faceless-pipeline.js");
vi.mock("../../src/core/audio-ducking.js");
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn() } }));

describe("cli-faceless", () => {
  const originalEnv = process.env;
  let exitSpy: any;
  let logSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.COMIC_TTS_VOICE;
    delete process.env.PEXELS_API_KEY;
    delete process.env.COMIC_WATERMARK_TEXT;
    vi.mocked(pickBackgroundMusic).mockReturnValue(null);
    vi.mocked(runFacelessPipeline).mockResolvedValue({ outputPath: "o.mp4", durationSec: 42.5, chapters: 6 } as any);
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("prints usage and exits without a topic", async () => {
    await expect(runFacelessCommand(["generate:faceless"])).rejects.toThrow("exit");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("--topic"));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("runs the pipeline with defaults", async () => {
    await runFacelessCommand(["generate:faceless", "--topic", "buracos negros"]);
    expect(runFacelessPipeline).toHaveBeenCalledWith("buracos negros", { cfg: true }, {
      language: undefined, ttsVoice: "pt-BR-AntonioNeural", pexelsApiKey: undefined,
      musicPath: undefined, watermarkText: undefined,
    });
    expect(logSpy).toHaveBeenCalledWith("Short gerado: o.mp4 (42.5s, 6 cenas)");
  });

  it("honors language, voice, Pexels key, music and watermark", async () => {
    process.env.COMIC_TTS_VOICE = "en-US-GuyNeural";
    process.env.PEXELS_API_KEY = "KEY";
    process.env.COMIC_WATERMARK_TEXT = "wm";
    vi.mocked(pickBackgroundMusic).mockReturnValue("bgm.mp3");
    await runFacelessCommand(["generate:faceless", "--topic", "x", "--lang", "en-US"]);
    expect(runFacelessPipeline).toHaveBeenCalledWith("x", { cfg: true }, {
      language: "en-US", ttsVoice: "en-US-GuyNeural", pexelsApiKey: "KEY",
      musicPath: "bgm.mp3", watermarkText: "wm",
    });
  });
});
