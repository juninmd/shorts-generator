import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultTrendingDeps, runWeeklyTrendingShort, type TrendingDeps, type TrendingRunOptions } from "../../../src/core/trending/run-weekly.js";
import type { TrendingRepo } from "../../../src/core/trending/github-trending.js";
import { runComicPipeline } from "../../../src/core/comic/comic-pipeline.js";

vi.mock("../../../src/core/comic/comic-pipeline.js", () => ({ runComicPipeline: vi.fn().mockResolvedValue({ outputPath: "m.mp4" }) }));

const repo = (name: string, branch = "main"): TrendingRepo => ({
  fullName: name, description: "d", htmlUrl: `https://github.com/${name}`, stars: 200, language: null, defaultBranch: branch,
});
const README = "# Tool\nIt works.\n![Shot](https://raw.githubusercontent.com/o/a/main/s.png)\n![Shot](https://raw.githubusercontent.com/o/a/main/s.png)";
const options: TrendingRunOptions = {
  outputDir: "/out", windowDays: 7, minStars: 100, candidatePool: 5, maxImages: 4,
  ttsVoice: "pt-BR-AntonioNeural", verticalWidth: 1080, verticalHeight: 1920,
};

function makeDeps(overrides: Partial<TrendingDeps> = {}): TrendingDeps {
  return {
    searchRepos: vi.fn().mockResolvedValue([repo("o/used"), repo("o/a")]),
    readReadme: vi.fn().mockResolvedValue(README),
    fetchImages: vi.fn(async (images) => images.map((i: { url: string; alt: string }, n: number) => ({ ...i, path: `/img/${n}.png` }))),
    render: vi.fn().mockResolvedValue({ outputPath: "/out/a.mp4", durationSec: 30, chapters: 3 }),
    usedRepos: vi.fn().mockReturnValue(["O/Used"]),
    markUsed: vi.fn(),
    ...overrides,
  } as TrendingDeps;
}

describe("runWeeklyTrendingShort", () => {
  it("narrates the top unused repository and records it", async () => {
    const deps = makeDeps();
    const result = await runWeeklyTrendingShort({ ...options, token: "t", musicPath: "/m.mp3", watermarkText: "w" }, deps);
    expect(result.repo.fullName).toBe("o/a");
    expect(result.short.outputPath).toBe("/out/a.mp4");
    expect(deps.readReadme).toHaveBeenCalledWith("o/a", "main");
    expect(deps.fetchImages).toHaveBeenCalledWith([expect.objectContaining({ url: expect.stringContaining("s.png") })], path.join("/out", "trending", "o-a"), 4);
    expect(deps.render).toHaveBeenCalledWith(expect.objectContaining({ id: "o-a" }), expect.objectContaining({ musicPath: "/m.mp3", watermarkText: "w", ttsVoice: "pt-BR-AntonioNeural" }));
    expect(deps.markUsed).toHaveBeenCalledWith("o/a");
    expect(deps.searchRepos).toHaveBeenCalledWith(expect.objectContaining({ minStars: 100, perPage: 5, token: "t" }));
  });

  it("skips repositories without screenshots and ones that fail", async () => {
    const readReadme = vi.fn()
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValueOnce("no images here")
      .mockResolvedValueOnce(README);
    const deps = makeDeps({
      searchRepos: vi.fn().mockResolvedValue([repo("o/broken"), repo("o/text"), repo("o/a")]),
      readReadme,
      render: vi.fn().mockResolvedValue({ outputPath: "x", durationSec: 1, chapters: 3 }),
    });
    const result = await runWeeklyTrendingShort({ ...options, musicPath: undefined, token: undefined }, deps);
    expect(result.repo.fullName).toBe("o/a");
  });

  it("skips a README written in a CJK script", async () => {
    const chinese = "# 工具\n这是一个中文说明文件，内容很长。\n![s](https://raw.githubusercontent.com/o/z/main/s.png)";
    const deps = makeDeps({
      searchRepos: vi.fn().mockResolvedValue([repo("o/zh"), repo("o/a")]),
      readReadme: vi.fn().mockImplementation(async (name: string) => (name === "o/zh" ? chinese : README)),
    });
    const result = await runWeeklyTrendingShort(options, deps);
    expect(result.repo.fullName).toBe("o/a");
    expect(deps.fetchImages).toHaveBeenCalledTimes(1);
  });

  it("moves past a repository whose render fails", async () => {
    const render = vi.fn().mockRejectedValueOnce(new Error("ffmpeg")).mockResolvedValueOnce({ outputPath: "b", durationSec: 1, chapters: 3 });
    const deps = makeDeps({ searchRepos: vi.fn().mockResolvedValue([repo("o/a"), repo("o/b")]), render });
    const result = await runWeeklyTrendingShort(options, deps);
    expect(result.repo.fullName).toBe("o/b");
    expect(deps.markUsed).toHaveBeenCalledTimes(1);
  });

  it("fails when every candidate is used or unusable", async () => {
    const deps = makeDeps({ searchRepos: vi.fn().mockResolvedValue([repo("O/USED")]) });
    await expect(runWeeklyTrendingShort(options, deps)).rejects.toThrow("No new trending repository");
    expect(deps.markUsed).not.toHaveBeenCalled();
  });
});

describe("defaultTrendingDeps", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "trend-deps-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.unstubAllGlobals(); });

  it("wires the real modules to the registry under the output directory", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("api.github.com")) return new Response(JSON.stringify({ items: [{ full_name: "o/x", description: null, html_url: "h", stargazers_count: 1, language: null, default_branch: "main" }] }));
      if (url.includes("README")) return new Response("![s](https://raw.githubusercontent.com/o/x/main/a.png)");
      return new Response(new Uint8Array([9]));
    }));
    const deps = defaultTrendingDeps(dir);
    expect(deps.usedRepos()).toEqual([]);
    const search = await deps.searchRepos({ sinceDate: "2026-01-01", minStars: 1, perPage: 1 });
    expect(search[0]?.fullName).toBe("o/x");
    const md = await deps.readReadme("o/x", "main");
    expect(md).toContain("a.png");
    const images = await deps.fetchImages([{ alt: "s", url: "https://raw.githubusercontent.com/o/x/main/a.png" }], path.join(dir, "img"), 2);
    expect(images).toHaveLength(1);
    deps.markUsed("o/x");
    expect(deps.usedRepos()).toEqual(["o/x"]);
    await expect(deps.render({ id: "b" } as any, {} as any)).resolves.toEqual({ outputPath: "m.mp4" });
    expect(runComicPipeline).toHaveBeenCalledWith({ id: "b" }, {});
  });
});
