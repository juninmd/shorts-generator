import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { renderStickClip, renderStickPoster } from "../../../src/core/animated/stick-render.js";
import type { StickChapter } from "../../../src/core/animated/animated-types.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, out: { stdout: string }) => void) =>
    cb(null, { stdout: "" }),
  ),
}));

const chapter: StickChapter = {
  id: "c1",
  title: "Um comando",
  imagePath: "p.png",
  narrationText: "x",
  heading: "Acesso demais",
  emphasis: "demais",
  enter: true,
  beats: [{ cue: "shell", prop: "terminal", pose: "point" }],
};
const size = { width: 1080, height: 1920, fps: 30 };

function captureSpec(): () => Record<string, unknown> {
  let captured = "";
  vi.mocked(execFile).mockImplementationOnce(((_c: string, args: string[], _o: unknown, cb: any) => {
    captured = fs.readFileSync(args[1]!, "utf-8");
    cb(null, { stdout: "" });
  }) as any);
  return () => JSON.parse(captured);
}

describe("stick-render", () => {
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "stick-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("renders a poster from the chapter's scene and removes the spec afterwards", async () => {
    const spec = captureSpec();
    await renderStickPoster(chapter, "line", path.join(dir, "c1.poster.png"), size);

    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe(process.env.PYTHON_BIN || "python");
    expect(args[0]).toContain(path.join("scripts", "stickman_render.py"));
    expect(fs.existsSync(args[1]!)).toBe(false);
    expect(spec()).toMatchObject({ style: "line", heading: "Acesso demais", emphasis: "demais", beats: chapter.beats });
  });

  it("passes narration timing, audio and words so beats, lips and captions follow the voice", async () => {
    const spec = captureSpec();
    const words = [{ word: "shell", start: 0.5, end: 0.9 }];
    await renderStickClip(chapter, "pop", { ...chapter, audioPath: "a.mp3", durationSec: 4.2, words }, path.join(dir, "c1.mp4"), size);

    expect(spec()).toMatchObject({ style: "pop", out: path.join(dir, "c1.mp4"), durationSec: 4.2, audio: "a.mp3", words, enter: true, fps: 30 });
  });

  it("defaults to no emphasis and no entrance walk", async () => {
    const spec = captureSpec();
    const plain = { ...chapter, emphasis: undefined, enter: undefined };
    await renderStickClip(plain, "pop", { ...plain, audioPath: "", durationSec: 2, words: [] }, path.join(dir, "c.mp4"), size);
    expect(spec()).toMatchObject({ emphasis: "", enter: false, audio: "" });
  });

  it("removes the spec file even when the renderer fails", async () => {
    vi.mocked(execFile).mockImplementationOnce(((_c: string, _a: string[], _o: unknown, cb: any) =>
      cb(new Error("ffmpeg failed"), { stdout: "" })) as any);

    await expect(renderStickPoster(chapter, "pop", path.join(dir, "p.png"), size)).rejects.toThrow("ffmpeg failed");
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
