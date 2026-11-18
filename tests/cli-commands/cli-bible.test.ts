import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveMock, runPipelineMock, sendMock, publishMock, musicMock, runComicMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  runPipelineMock: vi.fn(),
  sendMock: vi.fn(),
  publishMock: vi.fn(),
  musicMock: vi.fn(),
  runComicMock: vi.fn(),
}));

vi.mock("../../src/core/channel-affiliate-repository.js", () => ({ ChannelAffiliateRepository: class {} }));
vi.mock("../../src/core/channel-bundle-repository.js", () => ({ ChannelBundleRepository: class {} }));
vi.mock("../../src/core/channel-config-resolver.js", () => ({
  ChannelConfigResolver: class { resolveRunConfig = resolveMock; },
  buildManagedPipelineConfig: vi.fn(() => ({ watermarkText: "wm", managed: true })),
}));
vi.mock("../../src/core/config.js", () => ({ loadConfig: vi.fn(() => ({})) }));
vi.mock("../../src/core/control-plane-config.js", () => ({ loadControlPlaneConfig: vi.fn(() => ({})) }));
vi.mock("../../src/core/control-plane-db.js", () => ({ getControlPlanePool: vi.fn(() => ({})) }));
vi.mock("../../src/core/secret-store.js", () => ({ createSecretStore: vi.fn(() => ({})) }));
vi.mock("../../src/core/audio-ducking.js", () => ({ pickBackgroundMusic: musicMock }));
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
    musicMock.mockReturnValue(null);
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
      language: undefined, ttsVoice: "pt-BR-AntonioNeural", pexelsApiKey: undefined, musicPath: undefined, watermarkText: "wm",
    });
    expect(sendMock).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("--publish /out/v.publish.json"));
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
