import { describe, expect, it, vi } from "vitest";
import { runBiblePipeline } from "../../../src/core/faceless/bible-pipeline.js";
import { generateBibleScript } from "../../../src/core/faceless/bible-script.js";
import { buildVerseCardBook } from "../../../src/core/faceless/verse-cards.js";
import { runComicPipeline } from "../../../src/core/comic/comic-pipeline.js";

vi.mock("../../../src/core/faceless/bible-script.js");
vi.mock("../../../src/core/faceless/verse-cards.js");
vi.mock("../../../src/core/comic/comic-pipeline.js");
vi.mock("../../../src/core/faceless/bible-music.js", () => ({ bibleMusicCredit: vi.fn(() => "CREDIT") }));
vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn() } }));

describe("bible pipeline", () => {
  it("script → verse cards → narrated short → publish metadata", async () => {
    const script = { title: "T", reference: "Jo 4,1-26", scenes: [{ narration: "n", act: "gancho", verse: "v", keywords: "k" }] };
    vi.mocked(generateBibleScript).mockResolvedValue(script as any);
    vi.mocked(buildVerseCardBook).mockResolvedValue({ id: "b", title: "T", chapters: [] });
    vi.mocked(runComicPipeline).mockResolvedValue({ outputPath: "/out/v.mp4", durationSec: 50, chapters: 1 } as any);
    const config = { tempDir: "/tmp", outputDir: "/out", verticalWidth: 1080, verticalHeight: 1920, managedRun: { channelId: "c" } } as any;

    const meta = await runBiblePipeline("Jo 4,1-26", config, { ttsVoice: "v", language: "pt-BR", watermarkText: "wm", pexelsApiKey: "PK", musicPath: "assets/music/bible/reminiscing.mp3" });

    expect(generateBibleScript).toHaveBeenCalledWith("Jo 4,1-26", config, "pt-BR");
    expect(vi.mocked(buildVerseCardBook).mock.calls[0]![1]).toMatch(/bible$/);
    expect(vi.mocked(buildVerseCardBook).mock.calls[0]![2]).toBe("PK");
    expect(vi.mocked(runComicPipeline).mock.calls[0]![1]).toMatchObject({ ttsVoice: "v", watermarkText: "wm", outputDir: "/out" });
    expect(meta.description).toContain("CREDIT");
    expect(meta).toMatchObject({ channelId: "c", videoPath: "/out/v.mp4", durationSec: 50, reference: "Jo 4,1-26" });
  });
});
