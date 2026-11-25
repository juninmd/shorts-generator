import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runAnimatedCommand } from "../../src/cli-commands/cli-animated.js";
import { loadConfig } from "../../src/core/config.js";
import { runAnimatedPipeline } from "../../src/core/animated/animated-pipeline.js";
import { buildAntonioCodeDemoBook } from "../../src/core/animated/animated-demo.js";
import fs from "node:fs";

vi.mock("node:fs");
vi.mock("../../src/core/config.js");
vi.mock("../../src/core/animated/animated-pipeline.js");
vi.mock("../../src/core/animated/animated-demo.js", () => ({ buildAntonioCodeDemoBook: vi.fn(() => ({ id: "demo" })) }));
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

describe("cli-animated", () => {
  let exitSpy: any;
  let consoleSpy: any;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, ANIMATED_VOICE: "silent" };
    vi.mocked(loadConfig).mockReturnValue({ outputDir: "out", verticalWidth: 1080, verticalHeight: 1920 } as any);
    vi.mocked(runAnimatedPipeline).mockResolvedValue({ outputPath: "o.mp4", durationSec: 9, chapters: 2 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ id: "custom" }));
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("renders the Antonio Code demo with the narration chosen from the environment", async () => {
    await runAnimatedCommand(["generate:animated", "--demo"]);

    expect(buildAntonioCodeDemoBook).toHaveBeenCalled();
    const [book, config] = vi.mocked(runAnimatedPipeline).mock.calls[0]!;
    expect(book).toEqual({ id: "demo" });
    expect(config.narration.provider).toBe("silent");
    expect(config.outputDir).toBe("out");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("o.mp4"));
  });

  it("renders a user-supplied book from --book", async () => {
    await runAnimatedCommand(["generate:animated", "--book", "book.json"]);
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining("book.json"), "utf-8");
    expect(vi.mocked(runAnimatedPipeline).mock.calls[0]![0]).toEqual({ id: "custom" });
  });

  it("prints usage and exits when no book is given", async () => {
    exitSpy.mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(runAnimatedCommand(["generate:animated"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(runAnimatedPipeline).not.toHaveBeenCalled();
  });
});
