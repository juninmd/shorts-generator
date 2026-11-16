import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runTrendingCommand } from "../../src/cli-commands/cli-trending.js";
import { loadConfig } from "../../src/core/config.js";
import { pickBackgroundMusic } from "../../src/core/audio-ducking.js";
import { ensureAmbientPad } from "../../src/core/trending/ambient-track.js";
import { runWeeklyTrendingShort } from "../../src/core/trending/run-weekly.js";

vi.mock("../../src/core/config.js");
vi.mock("../../src/core/audio-ducking.js");
vi.mock("../../src/core/trending/ambient-track.js");
vi.mock("../../src/core/trending/run-weekly.js", () => ({
  runWeeklyTrendingShort: vi.fn(),
  defaultTrendingDeps: vi.fn(() => ({ deps: true })),
}));
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe("cli-trending", () => {
  const env = process.env;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...env };
    for (const key of ["TRENDING_WINDOW_DAYS", "TRENDING_MIN_STARS", "TRENDING_CANDIDATES", "TRENDING_MAX_IMAGES", "GITHUB_TOKEN", "COMIC_TTS_VOICE", "COMIC_WATERMARK_TEXT"]) delete process.env[key];
    vi.mocked(loadConfig).mockReturnValue({ outputDir: "/out", verticalWidth: 1080, verticalHeight: 1920 } as any);
    vi.mocked(pickBackgroundMusic).mockReturnValue(null);
    vi.mocked(ensureAmbientPad).mockResolvedValue("/out/trending/ambient-pad.mp3");
    vi.mocked(runWeeklyTrendingShort).mockResolvedValue({
      repo: { fullName: "o/a" } as any,
      short: { outputPath: "/out/a.mp4", durationSec: 42.5, chapters: 4 } as any,
    });
  });
  afterEach(() => { process.env = env; vi.restoreAllMocks(); });

  it("uses defaults, the generated pad and prints the result", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runTrendingCommand();
    expect(ensureAmbientPad).toHaveBeenCalledWith(expect.stringContaining("trending"));
    expect(runWeeklyTrendingShort).toHaveBeenCalledWith(expect.objectContaining({
      windowDays: 7, minStars: 100, candidatePool: 15, maxImages: 6, token: undefined,
      ttsVoice: "pt-BR-AntonioNeural", watermarkText: undefined, musicPath: "/out/trending/ambient-pad.mp3",
      verticalWidth: 1080, verticalHeight: 1920,
    }), { deps: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Short de o/a gerado: /out/a.mp4 (42.5s, 4 capítulos)"));
  });

  it("reads overrides from the environment and prefers a configured track", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.TRENDING_WINDOW_DAYS = "3";
    process.env.TRENDING_MIN_STARS = "not-a-number";
    process.env.TRENDING_CANDIDATES = "0";
    process.env.TRENDING_MAX_IMAGES = "2";
    process.env.GITHUB_TOKEN = "tok";
    process.env.COMIC_TTS_VOICE = "pt-BR-FranciscaNeural";
    process.env.COMIC_WATERMARK_TEXT = "@canal";
    vi.mocked(pickBackgroundMusic).mockReturnValue("/music/bed.mp3");
    await runTrendingCommand();
    expect(ensureAmbientPad).not.toHaveBeenCalled();
    expect(runWeeklyTrendingShort).toHaveBeenCalledWith(expect.objectContaining({
      windowDays: 3, minStars: 100, candidatePool: 15, maxImages: 2, token: "tok",
      ttsVoice: "pt-BR-FranciscaNeural", watermarkText: "@canal", musicPath: "/music/bed.mp3",
    }), expect.anything());
  });
});
