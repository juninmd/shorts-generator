import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import {
  extractImages,
  fetchReadme,
  isMostlyLatin,
  parseReadme,
  plainText,
  rawBaseUrl,
  rawReadmeUrl,
} from "../../../src/core/trending/readme.js";

const BASE = rawBaseUrl("acme/tool", "main");

describe("readme", () => {
  it("builds raw GitHub URLs", () => {
    expect(rawReadmeUrl("acme/tool", "dev")).toBe("https://raw.githubusercontent.com/acme/tool/dev/README.md");
    expect(BASE).toBe("https://raw.githubusercontent.com/acme/tool/main/");
  });

  it("fetches the README text and fails on a missing file", async () => {
    const ok = vi.fn().mockResolvedValue(new Response("# Hi"));
    await expect(fetchReadme("acme/tool", "main", ok)).resolves.toBe("# Hi");
    const missing = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(fetchReadme("acme/tool", "main", missing)).rejects.toThrow("HTTP 404");
  });

  it("uses the global fetch when none is injected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("body")));
    await expect(fetchReadme("acme/tool", "main")).resolves.toBe("body");
    vi.unstubAllGlobals();
  });

  it("keeps raster screenshots, resolves relative paths, drops badges and SVGs", () => {
    const line = '![Shot](docs/shot.png) ![logo](logo.svg) ![ci](https://img.shields.io/x.png) <img src="https://example.com/a.jpg?x=1" alt="Ab">';
    expect(extractImages(line, BASE)).toEqual([
      { alt: "Shot", url: "https://raw.githubusercontent.com/acme/tool/main/docs/shot.png" },
      { alt: "Ab", url: "https://example.com/a.jpg?x=1" },
    ]);
  });

  it("handles titles, missing alt, non-https and malformed URLs", () => {
    expect(extractImages('![t](pic.webp "Title")', BASE)).toEqual([
      { alt: "t", url: "https://raw.githubusercontent.com/acme/tool/main/pic.webp" },
    ]);
    expect(extractImages('<img src="a.png">', BASE)).toEqual([
      { alt: "", url: "https://raw.githubusercontent.com/acme/tool/main/a.png" },
    ]);
    expect(extractImages('<img alt="x">', BASE)).toEqual([]);
    expect(extractImages("![x](http://insecure.test/a.png)", BASE)).toEqual([]);
    expect(extractImages("![x](https://[bad/a.png)", BASE)).toEqual([]);
  });

  it("strips markup from prose", () => {
    expect(plainText("**Fast** [docs](https://x.test) `code` <b>bold</b> ![i](a.png)")).toBe("Fast docs code bold");
  });

  it("splits sections by heading and skips code and tables", () => {
    const md = [
      "# Title",
      "Intro line.",
      "```bash",
      "npm install",
      "```",
      "| a | b |",
      "## Screens",
      "![Home](home.png)",
      "Shown below.",
      "",
    ].join("\n");
    const sections = parseReadme(md, BASE);
    expect(sections.map((s) => s.heading)).toEqual(["Title", "Screens"]);
    expect(sections[0]?.text).toBe("Intro line.");
    expect(sections[1]?.images).toHaveLength(1);
    expect(sections[1]?.text).toBe("Shown below.");
  });

  it("returns nothing for an empty README and keeps headingless prose", () => {
    expect(parseReadme("", BASE)).toEqual([]);
    expect(parseReadme("Just prose\r\n", BASE)).toEqual([{ heading: "", text: "Just prose", images: [] }]);
    expect(parseReadme("# A\n\n# B\nx", BASE).map((s) => s.heading)).toEqual(["A", "B"]);
  });

  it("detects CJK-language READMEs", () => {
    expect(isMostlyLatin([{ heading: "", text: "Plain English prose.", images: [] }])).toBe(true);
    expect(isMostlyLatin([{ heading: "", text: "", images: [] }])).toBe(true);
    expect(isMostlyLatin([{ heading: "", text: "这是一个很长的中文说明文本，用于测试识别。", images: [] }])).toBe(false);
    expect(isMostlyLatin([{ heading: "", text: "Mostly English words here and a few 中", images: [] }])).toBe(true);
  });
});
