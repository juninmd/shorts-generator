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
  let mockRl: { question: vi.Mock; close: vi.Mock };
  let exitSpy: vi.Mock<[number?], never>;
  let logSpy: vi.Mock<any[], void>;
  let errorSpy: vi.Mock<any[], void>;

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

  const setupMocks = (questions: string[], config: any, pipelineRes: any) => {
    questions.forEach(q => mockRl.question.mockResolvedValueOnce(q));
    vi.mocked(loadConfig).mockReturnValue(config as any);
    vi.mocked(runPipeline).mockResolvedValue(pipelineRes);
  };

  it("should handle mode 1 (recent videos) successfully", async () => {
    setupMocks(["1", "@channel123", "2", "3"], { channels: ["@channel123"], specificUrls: [], videoLimit: 2 }, [{ videoId: "v1", shorts: ["s1", "s2"], errors: [] }]);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith({
      channels: ["@channel123"], specificUrls: [], videoLimit: 2, maxClipsOverride: 3, minShortsPerVideo: 3,
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ videosProcessed: 1, totalShorts: 2, totalErrors: 0 }), "✅ Pipeline finalizada"
    );
  });

  it("should retry invalid menu pick", async () => {
    setupMocks(["4", "invalid", "1", "@channel123", "2", "AUTO"], { channels: ["@channel123"], specificUrls: [], videoLimit: 2 }, [{ videoId: "v1", shorts: [], errors: [] }]);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith({ channels: ["@channel123"], specificUrls: [], videoLimit: 2 });
  });

  it("should handle mode 2 (most viewed) successfully", async () => {
    setupMocks(["2", "@ch1, @ch2", "", "invalid_clips"], { channels: ["@ch1", "@ch2"], specificUrls: [], videoLimit: 1, sortByViews: true }, []);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith({ channels: ["@ch1", "@ch2"], specificUrls: [], videoLimit: 1, sortByViews: true });
  });

  it("should handle mode 3 (specific URL) successfully", async () => {
    setupMocks(["3", "https://example.com/url1,https://example.com/url2", "-5"], { channels: [], specificUrls: ["https://example.com/url1", "https://example.com/url2"] }, []);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith({ channels: [], specificUrls: ["https://example.com/url1", "https://example.com/url2"] });
  });

  it("should enforce minimum video limit of 1", async () => {
    setupMocks(["1", "@channel123", "0", "AUTO"], { channels: ["@channel123"], specificUrls: [], videoLimit: 1 }, []);

    await runInteractive();

    expect(loadConfig).toHaveBeenCalledWith(expect.objectContaining({ videoLimit: 1 }));
  });

  describe("Exit scenarios", () => {
    const runExitTest = async (questions: string[], expectedErrorMsg: string, pipelineRes?: any) => {
      questions.forEach(q => mockRl.question.mockResolvedValueOnce(q));
      if (pipelineRes !== undefined) {
        vi.mocked(loadConfig).mockReturnValue({ channels: [], specificUrls: ["https://example.com/url"] } as any);
        vi.mocked(runPipeline).mockResolvedValue(pipelineRes);
      } else {
        vi.mocked(loadConfig).mockReturnValue({ channels: [], specificUrls: [] } as any);
      }
      exitSpy.mockImplementationOnce(() => { throw new Error("process.exit"); });

      await expect(runInteractive()).rejects.toThrow("process.exit");
      expect(exitSpy).toHaveBeenCalledWith(1);

      if (expectedErrorMsg.includes("0 shorts gerados") || expectedErrorMsg.includes("Nenhum canal ou URL")) {
        expect(logger.error).toHaveBeenCalledWith(expectedErrorMsg);
      } else {
        expect(errorSpy).toHaveBeenCalledWith(expectedErrorMsg);
        expect(mockRl.close).toHaveBeenCalled();
      }
    };

    it("should exit if no channels provided in mode 1", () => runExitTest(["1", ""], "  ❌ Nenhum canal informado."));
    it("should exit if no URLs provided in mode 3", () => runExitTest(["3", ""], "  ❌ Nenhuma URL informada."));
    it("should exit if loadConfig returns empty config", () => runExitTest(["3", "https://example.com/url", "AUTO"], "Nenhum canal ou URL encontrado. Verifique as entradas."));

    it("should exit with 1 if total errors > 0 and no shorts generated", () =>
      runExitTest(["3", "https://example.com/url", "AUTO"], "Execução falhou (0 shorts gerados). Verifique os erros acima.", [{ videoId: "v1", shorts: [], errors: [new Error("e1")] }])
    );
  });

  it("should trigger progress callback from runPipeline", async () => {
    setupMocks(["3", "https://example.com/url", "AUTO"], { channels: [], specificUrls: ["https://example.com/url"] }, []);
    vi.mocked(runPipeline).mockImplementation(async (config, cb) => {
      if (cb) cb({ stage: "test", progress: 50.5, message: "msg" });
      return [];
    });

    await runInteractive();

    expect(logger.info).toHaveBeenCalledWith({ stage: "test", progress: "51%", message: "msg" }, "Pipeline status");
  });
});
