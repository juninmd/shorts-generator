import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import { processClip } from "../../src/core/video-processor.js";
import { renderShort } from "../../src/core/short-renderer.js";
import { resolveBroll } from "../../src/core/broll.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, mkdirSync: vi.fn(), writeFileSync: vi.fn(), existsSync: vi.fn(() => false) } };
});
vi.mock("../../src/core/short-renderer.js", () => ({ renderShort: vi.fn() }));
vi.mock("../../src/core/broll.js", () => ({ resolveBroll: vi.fn() }));
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), debug: vi.fn() } }));

const w = (word: string, start: number, end: number) => ({ word, start, end });
const video = { id: "v1", filePath: "in.mp4", url: "u", title: "T", channelName: "C" } as any;
const config = { outputDir: "/out", verticalWidth: 1080, verticalHeight: 1920, watermarkText: "" } as any;
const clip = {
  id: "c1", title: "Título", presenter: "Ana", startTime: 10, endTime: 20, duration: 10,
  words: [w("a", 0.1, 0.5), w("eh", 0.6, 1.0), w("b", 3.0, 3.4), w("c", 3.5, 9.8)],
  transcript: [], hashtags: [], broll: [{ at: 5, query: "city" }],
} as any;

describe("processClip edits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SILENCE_CUT;
    vi.mocked(resolveBroll).mockResolvedValue([{ at: 2, duration: 2.6, path: "b.mp4" }]);
  });

  it("renders the edited clip: pauses and fillers cut, B-roll resolved on the new timeline, captions rebuilt", async () => {
    const short = await processClip(video, clip, config);
    const [, , subtitlePath, edited, , plan] = vi.mocked(renderShort).mock.calls[0]!;
    expect(subtitlePath).toBe("/out/v1/c1.ass");
    expect(plan!.ranges!.length).toBeGreaterThan(1);
    expect(plan!.sourceDuration).toBe(10);
    expect(plan!.broll).toEqual([{ at: 2, duration: 2.6, path: "b.mp4" }]);
    expect(edited.duration).toBeLessThan(10);
    expect(edited.words.map((x: any) => x.word)).toEqual(["a", "b", "c"]);
    expect(short.clip).toBe(edited);
    expect(vi.mocked(resolveBroll).mock.calls[0]![0]).toEqual(edited.broll);
    const ass = vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string;
    expect(ass).toContain(",Hook,,");
    expect(ass).toContain("LowerThird");
  });

  it("renders the untouched clip when SILENCE_CUT=false", async () => {
    process.env.SILENCE_CUT = "false";
    const short = await processClip(video, clip, config);
    const plan = vi.mocked(renderShort).mock.calls[0]![5]!;
    expect(plan.ranges).toBeUndefined();
    expect(short.clip).toBe(clip);
  });

  it("derives the brand template from the managed channel", async () => {
    vi.mocked(fs.existsSync).mockImplementation((file) => String(file) === "brand-templates/my-channel.json");
    const spy = vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ hook: false }));
    await processClip(video, clip, { ...config, managedRun: { channelId: "id-9", channelName: "My Channel" } });
    expect(vi.mocked(fs.writeFileSync).mock.calls[0]![1]).not.toContain(",Hook,,");
    spy.mockRestore();
  });
});
