import { describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { detectSceneChanges, parseSceneTimes } from "../../src/core/scene-changes.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
vi.mock("../../src/core/ffmpeg-bin.js", () => ({ ffmpegBin: () => "ffmpeg" }));

describe("scene changes", () => {
  it("parses showinfo timestamps", () => {
    expect(parseSceneTimes("n:0 pts:1 pts_time:2.5 pos:3\nn:1 pts_time:10 x")).toEqual([2.5, 10]);
    expect(parseSceneTimes("")).toEqual([]);
  });

  it("returns cuts relative to the clip start, [] on failure", async () => {
    vi.mocked(execFile).mockImplementationOnce(((_f: any, _a: any, _o: any, cb: any) => {
      cb(null, { stdout: "", stderr: "pts_time:4.2" });
      return {} as any;
    }) as any);
    expect(await detectSceneChanges("in.mp4", 10, 30)).toEqual([4.2]);
    vi.mocked(execFile).mockImplementationOnce(((_f: any, _a: any, _o: any, cb: any) => {
      cb(new Error("boom"), { stdout: "", stderr: "" });
      return {} as any;
    }) as any);
    expect(await detectSceneChanges("in.mp4", 10, 30)).toEqual([]);
  });
});
