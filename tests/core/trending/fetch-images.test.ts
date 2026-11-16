import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadImages } from "../../../src/core/trending/fetch-images.js";

describe("downloadImages", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "trend-img-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.unstubAllGlobals(); });

  it("saves images in reading order, skips failures and respects the limit", async () => {
    const images = [
      { alt: "one", url: "https://h.test/one.PNG" },
      { alt: "bad", url: "https://h.test/bad.png" },
      { alt: "two", url: "https://h.test/two.jpeg" },
      { alt: "three", url: "https://h.test/three.gif" },
    ];
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("bad")) return new Response("", { status: 500 });
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const out = await downloadImages(images, dir, 2, fetchImpl);
    expect(out.map((i) => i.alt)).toEqual(["one", "two"]);
    expect(out[0]?.path.endsWith("shot-1.png")).toBe(true);
    expect(out[1]?.path.endsWith("shot-2.jpg")).toBe(true);
    expect(fs.readFileSync(out[0]!.path)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("handles a network error for one image and uses global fetch by default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(downloadImages([{ alt: "a", url: "https://h.test/a.webp" }], dir, 3)).resolves.toEqual([]);
  });
});
