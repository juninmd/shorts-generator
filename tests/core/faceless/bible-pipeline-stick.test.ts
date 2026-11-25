import { describe, expect, it, vi } from "vitest";
import { runBiblePipeline } from "../../../src/core/faceless/bible-pipeline.js";
import { generateBibleScript } from "../../../src/core/faceless/bible-script.js";
import { runAnimatedPipeline } from "../../../src/core/animated/animated-pipeline.js";
import { buildVerseCardBook } from "../../../src/core/faceless/verse-cards.js";

vi.mock("../../../src/core/faceless/bible-script.js");
vi.mock("../../../src/core/faceless/verse-cards.js");
vi.mock("../../../src/core/animated/animated-pipeline.js");
vi.mock("../../../src/core/faceless/bible-music.js", () => ({ bibleMusicCredit: vi.fn(() => "CREDIT") }));
vi.mock("../../../src/core/faceless/footage-judge.js", () => ({ createFootageJudge: vi.fn(() => "JUDGE") }));
vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn() } }));

describe("bible pipeline, stick visual", () => {
  it("renders stick-figure chapters instead of footage cards and keeps the same metadata", async () => {
    const script = {
      title: "T", reference: "Lc 15,20",
      scenes: [1, 2, 3, 4, 5].map((n) => ({ act: ["gancho", "contexto", "acontecimento", "virada", "aplicacao"][n - 1], narration: "n", verse: "v", keywords: "k" })),
    };
    vi.mocked(generateBibleScript).mockResolvedValue(script as any);
    vi.mocked(runAnimatedPipeline).mockResolvedValue({ outputPath: "/out/s.mp4", durationSec: 51, chapters: 5 } as any);
    const config = { tempDir: "/tmp", outputDir: "/out", verticalWidth: 1080, verticalHeight: 1920, managedRun: { channelId: "c" } } as any;
    const narration = { provider: "silent", edgeVoice: "v" } as const;

    const meta = await runBiblePipeline("Lc 15,20", config, { ttsVoice: "v", visual: "stick", narration: narration as any, musicPath: "m.mp3" });

    expect(buildVerseCardBook).not.toHaveBeenCalled();
    const [book, options] = vi.mocked(runAnimatedPipeline).mock.calls[0]!;
    expect(book.chapters).toHaveLength(5);
    expect(options).toMatchObject({ outputDir: "/out", verticalWidth: 1080, style: "line", narration, musicPath: "m.mp3" });
    expect(meta).toMatchObject({ channelId: "c", videoPath: "/out/s.mp4", durationSec: 51, reference: "Lc 15,20" });
  });

  it("refuses the stick visual without a narration config", async () => {
    vi.mocked(generateBibleScript).mockResolvedValue({ title: "T", reference: "Lc 15,20", scenes: [] } as any);
    await expect(runBiblePipeline("Lc 15,20", {} as any, { ttsVoice: "v", visual: "stick" })).rejects.toThrow("narration config");
    expect(generateBibleScript).not.toHaveBeenCalled();
    expect(runAnimatedPipeline).not.toHaveBeenCalled();
  });
});
