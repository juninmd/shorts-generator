import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runInteractive } from "../src/cli-interactive.js";
import { createInterface } from "node:readline/promises";
import { loadConfig } from "../src/core/config.js";
import { runPipeline } from "../src/core/pipeline.js";
import { logger } from "../src/core/logger.js";

vi.mock("node:readline/promises");
vi.mock("../src/core/config.js");
vi.mock("../src/core/pipeline.js");
vi.mock("../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  }
}));

describe("CLI Interactive", () => {
  let mockRl: any;
  let exitSpy: any;
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    vi.resetAllMocks();

    mockRl = {
      question: vi.fn(),
      close: vi.fn(),
    };

    vi.mocked(createInterface).mockReturnValue(mockRl as any);

    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should handle mode 1 (recent videos) successfully", async () => {
    mockRl.question
      .mockResolvedValueOnce("1") // pickMenu
      .mockResolvedValueOnce("@test") // channels
      .mockResolvedValueOnce("2") // video limit
      .mockResolvedValueOnce("3"); // clips limit

    vi.mocked(loadConfig).mockReturnValue({
      channels: ["@test"],
      specificUrls: [],
      videoLimit: 2,
    } as any);

    vi.mocked(runPipeline).mockResolvedValue([
      { videoId: "v1", shorts: ["s1", "s2"], errors: [] }
    ]);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith({
      channels: ["@test"],
      specificUrls: [],
      videoLimit: 2,
      maxClipsOverride: 3,
      minShortsPerVideo: 3,
    });
    expect(runPipeline).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ videosProcessed: 1, totalShorts: 2, totalErrors: 0 }),
      "✅ Pipeline finalizada"
    );
  });

  it("should retry invalid menu pick", async () => {
    mockRl.question
      .mockResolvedValueOnce("4") // invalid
      .mockResolvedValueOnce("invalid") // invalid
      .mockResolvedValueOnce("1") // pickMenu
      .mockResolvedValueOnce("@test") // channels
      .mockResolvedValueOnce("2") // video limit
      .mockResolvedValueOnce("AUTO"); // clips limit

    vi.mocked(loadConfig).mockReturnValue({
      channels: ["@test"],
      specificUrls: [],
      videoLimit: 2,
    } as any);

    vi.mocked(runPipeline).mockResolvedValue([
      { videoId: "v1", shorts: [], errors: [] }
    ]);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith({
      channels: ["@test"],
      specificUrls: [],
      videoLimit: 2,
    });
  });

  it("should exit if no channels provided in mode 1", async () => {
    mockRl.question
      .mockResolvedValueOnce("1") // pickMenu
      .mockResolvedValueOnce(""); // empty channels
      // Add extra to avoid undefined error since exit throws in real life, but spy returns

    // simulate process.exit ending execution
    exitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); });

    await expect(runInteractive()).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith("  ❌ Nenhum canal informado.");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockRl.close).toHaveBeenCalled();
  });

  it("should handle mode 2 (most viewed) successfully", async () => {
    mockRl.question
      .mockResolvedValueOnce("2") // pickMenu
      .mockResolvedValueOnce("@test1, @test2") // channels
      .mockResolvedValueOnce("") // video limit (default 1)
      .mockResolvedValueOnce("invalid_clips"); // clips limit (ignored, auto)

    vi.mocked(loadConfig).mockReturnValue({
      channels: ["@test1", "@test2"],
      specificUrls: [],
      videoLimit: 1,
      sortByViews: true,
    } as any);

    vi.mocked(runPipeline).mockResolvedValue([]);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith({
      channels: ["@test1", "@test2"],
      specificUrls: [],
      videoLimit: 1,
      sortByViews: true,
    });
  });

  it("should handle mode 3 (specific URL) successfully", async () => {
    mockRl.question
      .mockResolvedValueOnce("3") // pickMenu
      .mockResolvedValueOnce("http://url1,http://url2") // urls
      .mockResolvedValueOnce("-5"); // clips limit (invalid, auto)

    vi.mocked(loadConfig).mockReturnValue({
      channels: [],
      specificUrls: ["http://url1", "http://url2"],
    } as any);

    vi.mocked(runPipeline).mockResolvedValue([]);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith({
      channels: [],
      specificUrls: ["http://url1", "http://url2"],
    });
  });

  it("should exit if no URLs provided in mode 3", async () => {
    mockRl.question
      .mockResolvedValueOnce("3") // pickMenu
      .mockResolvedValueOnce(""); // empty urls

    // simulate process.exit ending execution
    exitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); });

    await expect(runInteractive()).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalledWith("  ❌ Nenhuma URL informada.");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockRl.close).toHaveBeenCalled();
  });

  it("should exit if loadConfig returns empty config", async () => {
    mockRl.question
      .mockResolvedValueOnce("3") // pickMenu
      .mockResolvedValueOnce("http://url") // urls
      .mockResolvedValueOnce("AUTO"); // clips limit

    vi.mocked(loadConfig).mockReturnValue({
      channels: [],
      specificUrls: [],
    } as any);

    // simulate process.exit ending execution
    exitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); });

    await expect(runInteractive()).rejects.toThrow("process.exit");

    expect(logger.error).toHaveBeenCalledWith("Nenhum canal ou URL encontrado. Verifique as entradas.");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("should trigger progress callback from runPipeline", async () => {
    mockRl.question
      .mockResolvedValueOnce("3") // pickMenu
      .mockResolvedValueOnce("http://url") // urls
      .mockResolvedValueOnce("AUTO"); // clips limit

    vi.mocked(loadConfig).mockReturnValue({
      channels: [],
      specificUrls: ["http://url"],
    } as any);

    vi.mocked(runPipeline).mockImplementation(async (config, cb) => {
      if (cb) {
        cb({ stage: "test", progress: 50.5, message: "msg" });
      }
      return [];
    });

    await runInteractive();

    expect(logger.info).toHaveBeenCalledWith(
      { stage: "test", progress: "51%", message: "msg" },
      "Pipeline status"
    );
  });

  it("should exit with 1 if total errors > 0 and no shorts generated", async () => {
    mockRl.question
      .mockResolvedValueOnce("3")
      .mockResolvedValueOnce("http://url")
      .mockResolvedValueOnce("AUTO");

    vi.mocked(loadConfig).mockReturnValue({
      channels: [],
      specificUrls: ["http://url"],
    } as any);

    vi.mocked(runPipeline).mockResolvedValue([
      { videoId: "v1", shorts: [], errors: [new Error("e1"), new Error("e2")] }
    ]);

    // simulate process.exit ending execution
    exitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); });

    await expect(runInteractive()).rejects.toThrow("process.exit");

    expect(logger.error).toHaveBeenCalledWith("Execução falhou (0 shorts gerados). Verifique os erros acima.");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });


  it("should enforce minimum video limit of 1", async () => {
    mockRl.question
      .mockResolvedValueOnce("1") // pickMenu
      .mockResolvedValueOnce("@test") // channels
      .mockResolvedValueOnce("0") // video limit (0 is invalid)
      .mockResolvedValueOnce("AUTO"); // clips limit

    vi.mocked(loadConfig).mockReturnValue({
      channels: ["@test"],
      specificUrls: [],
      videoLimit: 1,
    } as any);

    vi.mocked(runPipeline).mockResolvedValue([]);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith(expect.objectContaining({
      videoLimit: 1,
    }));
  });
});
