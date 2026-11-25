import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { renderStickClip, renderStickPoster } from "../../../src/core/animated/stick-render.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, out: { stdout: string }) => void) =>
    cb(null, { stdout: "" }),
  ),
}));

const chapter = { id: "c1", title: "Um comando", imagePath: "p.png", narrationText: "x", pose: "alarm" as const, prop: "database" as const };
const size = { width: 1080, height: 1920, fps: 30 };

describe("stick-render", () => {
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "stick-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("renders a poster by handing the renderer a poster spec and removing the spec afterwards", async () => {
    const poster = path.join(dir, "c1.poster.png");
    await renderStickPoster(chapter, poster, size);

    const [cmd, args] = vi.mocked(execFile).mock.calls[0] as unknown as [string, string[]];
    expect(cmd).toBe(process.env.PYTHON_BIN || "python");
    expect(args[0]).toContain(path.join("scripts", "stick_render.py"));
    expect(fs.existsSync(args[1]!)).toBe(false);
  });

  it("passes the narrated duration and audio into the clip spec", async () => {
    let captured = "";
    vi.mocked(execFile).mockImplementationOnce(((_c: string, args: string[], _o: unknown, cb: any) => {
      captured = fs.readFileSync(args[1]!, "utf-8");
      cb(null, { stdout: "" });
    }) as any);

    await renderStickClip(chapter, { ...chapter, audioPath: "a.mp3", durationSec: 4.2, words: [] }, path.join(dir, "c1.mp4"), size);

    const spec = JSON.parse(captured);
    expect(spec).toMatchObject({ out: path.join(dir, "c1.mp4"), durationSec: 4.2, audio: "a.mp3", pose: "alarm", prop: "database", fps: 30 });
  });

  it("removes the spec file even when the renderer fails", async () => {
    vi.mocked(execFile).mockImplementationOnce(((_c: string, _a: string[], _o: unknown, cb: any) =>
      cb(new Error("ffmpeg failed"), { stdout: "" })) as any);

    await expect(renderStickPoster(chapter, path.join(dir, "p.png"), size)).rejects.toThrow("ffmpeg failed");
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
