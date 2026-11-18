import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveMock, runPipelineMock, sendMock, publishMock, musicMock, runComicMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  runPipelineMock: vi.fn(),
  sendMock: vi.fn(),
  publishMock: vi.fn(),
  musicMock: vi.fn(),
  runComicMock: vi.fn(),
}));

vi.mock("../../src/core/managed-config.js", () => ({ loadManagedConfig: resolveMock }));
vi.mock("../../src/core/faceless/bible-music.js", () => ({ pickBibleMusic: musicMock }));
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn() } }));
vi.mock("../../src/core/faceless/bible-pipeline.js", () => ({ runBiblePipeline: runPipelineMock }));
vi.mock("../../src/core/faceless/bible-preview.js", () => ({ sendBiblePreview: sendMock, publishBiblePreview: publishMock }));

import { runBibleCommand } from "../../src/cli-commands/cli-bible.js";

describe("cli-bible", () => {
  const env = process.env;
  let logSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...env };
    delete process.env.COMIC_TTS_VOICE;
    delete process.env.PEXELS_API_KEY;
    delete process.env.COMIC_TTS_RATE;
    delete process.env.COMIC_TTS_PITCH;
    delete process.env.BGM_VOLUME;
    resolveMock.mockResolvedValue({ watermarkText: "wm", managed: true });
    musicMock.mockReturnValue(undefined);
    runPipelineMock.mockResolvedValue({ videoPath: "/out/v.mp4" });
    sendMock.mockResolvedValue("/out/v.publish.json");
    publishMock.mockResolvedValue("https://youtube.com/shorts/x");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("exit"); }) as any);
  });
  afterEach(() => {
    process.env = env;
    vi.restoreAllMocks();
  });

  it("prints usage without a channel or without passage/publish", async () => {
    await expect(runBibleCommand(["--passage", "x"])).rejects.toThrow("exit");
    await expect(runBibleCommand(["--managed-channel", "c"])).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Usage"));
  });

  it("generates the short and sends the approval card", async () => {
    await runBibleCommand(["--managed-channel", "santidade-catolica", "--passage", "Lucas 15,11-24"]);
    expect(runPipelineMock).toHaveBeenCalledWith("Lucas 15,11-24", expect.objectContaining({ managed: true }), {
      language: undefined, ttsVoice: "pt-BR-ThalitaMultilingualNeural", pexelsApiKey: undefined, musicPath: undefined, watermarkText: "wm",
    });
    expect(sendMock).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("--publish /out/v.publish.json"));
  });

  it("defaults to a calm voice and a softer track, but respects overrides", async () => {
    await runBibleCommand(["--managed-channel", "c", "--passage", "p"]);
    expect([process.env.COMIC_TTS_RATE, process.env.COMIC_TTS_PITCH, process.env.BGM_VOLUME]).toEqual(["-8%", undefined, "0.25"]);
    process.env.BGM_VOLUME = "0.1";
    await runBibleCommand(["--managed-channel", "c", "--passage", "p"]);
    expect(process.env.BGM_VOLUME).toBe("0.1");
  });

  it("honors language, voice and music", async () => {
    process.env.COMIC_TTS_VOICE = "en-US-GuyNeural";
    process.env.PEXELS_API_KEY = "PK";
    musicMock.mockReturnValue("bgm.mp3");
    await runBibleCommand(["--managed-channel", "c", "--passage", "p", "--lang", "en-US"]);
    expect(runPipelineMock.mock.calls[0]![2]).toMatchObject({ language: "en-US", ttsVoice: "en-US-GuyNeural", pexelsApiKey: "PK", musicPath: "bgm.mp3" });
  });

  it("publishes an approved preview", async () => {
    await runBibleCommand(["--managed-channel", "c", "--publish", "/out/v.publish.json"]);
    expect(publishMock).toHaveBeenCalledWith("/out/v.publish.json", expect.objectContaining({ managed: true }));
    expect(runPipelineMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("Publicado: https://youtube.com/shorts/x");
  });
});
