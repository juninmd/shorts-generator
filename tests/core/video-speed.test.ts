import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activeDeliverySpec } from "../../src/core/delivery-spec.js";
import { runFfmpeg } from "../../src/core/ffmpeg-run.js";
import { applySpeed, videoSpeed } from "../../src/core/video-speed.js";
import type { PipelineConfig } from "../../src/types.js";

vi.mock("../../src/core/ffmpeg-run.js", () => ({ runFfmpeg: vi.fn(async () => ({ stderr: "", durationMs: 1 })) }));

describe("video speed", () => {
  afterEach(() => { delete process.env.VIDEO_SPEED; vi.restoreAllMocks(); });

  it.each([
    [undefined, 1], ["abc", 1], ["1", 1], ["1.005", 1], ["0.5", 1], ["1.25", 1.25], ["3", 2],
  ])("VIDEO_SPEED=%s resolves to %s", (value, expected) => {
    if (value !== undefined) process.env.VIDEO_SPEED = value;
    expect(videoSpeed()).toBe(expected);
  });

  it("re-encodes with atempo (pitch kept) and replaces the file", async () => {
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => undefined);
    await applySpeed("clip", 1.5, { videoEncoder: "libx264" } as PipelineConfig, activeDeliverySpec());
    const args = vi.mocked(runFfmpeg).mock.calls[0]![0];
    expect(args.join(" ")).toContain("[0:v]setpts=PTS/1.5,fps=30[v];[0:a]atempo=1.5[a]");
    expect(args.at(-1)).toBe("clip.speed.mp4");
    expect(rename).toHaveBeenCalledWith("clip.speed.mp4", "clip");
  });
});
