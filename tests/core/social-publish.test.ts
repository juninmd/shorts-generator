import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import { publicVideoUrl, publishSocialPost, pruneSocialFiles, socialDir } from "../../src/core/social-publish.js";
import { PUBLISHERS } from "../../src/core/publishers/index.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, existsSync: vi.fn(), readdirSync: vi.fn(), statSync: vi.fn(), unlinkSync: vi.fn() } };
});
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn() } }));

const job = {
  platform: "bluesky" as const, publicName: "abc.mp4", outputDir: "/out", serverPublicUrl: "https://srv.example/",
  copy: { title: "T", caption: "C", description: "D" },
};

describe("social files", () => {
  it("lives under the output directory", () => {
    expect(socialDir({ outputDir: "/out" })).toBe("/out/social");
  });

  it("builds the public URL without doubling slashes, undefined without a base", () => {
    expect(publicVideoUrl("https://srv.example//", "a.mp4")).toBe("https://srv.example/public/social/a.mp4");
    expect(publicVideoUrl(undefined, "a.mp4")).toBeUndefined();
  });
});

describe("publishSocialPost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hands the local file, public URL and copy to the platform's publisher", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const spy = vi.spyOn(PUBLISHERS.bluesky, "publish").mockResolvedValue("https://bsky.app/post/1");
    expect(await publishSocialPost(job)).toBe("https://bsky.app/post/1");
    expect(spy).toHaveBeenCalledWith({
      videoPath: "/out/social/abc.mp4", videoUrl: "https://srv.example/public/social/abc.mp4", copy: job.copy,
    });
    spy.mockRestore();
  });

  it("fails when the queued copy is gone", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    await expect(publishSocialPost(job)).rejects.toThrow("Social video not found: /out/social/abc.mp4");
  });
});

describe("pruneSocialFiles", () => {
  const now = Date.UTC(2026, 9, 19);
  const day = 24 * 3600_000;

  it("deletes copies older than a week and keeps recent ones", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["old.mp4", "new.mp4"] as any);
    vi.mocked(fs.statSync).mockImplementation(((file: string) => ({ mtimeMs: file.endsWith("old.mp4") ? now - 8 * day : now - day })) as any);
    expect(pruneSocialFiles({ outputDir: "/out" }, now)).toBe(1);
    expect(fs.unlinkSync).toHaveBeenCalledWith("/out/social/old.mp4");
  });

  it("does nothing without the directory", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(pruneSocialFiles({ outputDir: "/out" }, now)).toBe(0);
  });

  it("defaults to the current time", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(["x.mp4"] as any);
    vi.mocked(fs.statSync).mockReturnValue({ mtimeMs: Date.now() } as any);
    expect(pruneSocialFiles({ outputDir: "/out" })).toBe(0);
  });
});
