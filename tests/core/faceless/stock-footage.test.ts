import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { downloadFootage, fetchSceneFootage, searchStockFootage } from "../../../src/core/faceless/stock-footage.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, mkdirSync: vi.fn(), writeFileSync: vi.fn() } };
});
vi.mock("../../../src/core/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

const file = (width: number, height: number, link: string, file_type = "video/mp4") => ({ file_type, width, height, link });
const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(4) });

describe("stock footage (Pexels)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns null without an API key and never calls the network", async () => {
    expect(await searchStockFootage("ocean", undefined, new Set())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("picks the portrait mp4 closest to 1080px, skipping used videos", async () => {
    fetchMock.mockResolvedValue(json({
      videos: [
        { id: 1, video_files: [file(1080, 1920, "used")] },
        { id: 2, video_files: [file(1920, 1080, "landscape"), file(2160, 3840, "uhd"), file(1080, 1920, "good"), file(1080, 1920, "x", "video/webm")] },
      ],
    }));
    const clip = await searchStockFootage("ocean waves", "KEY", new Set([1]));
    expect(clip).toEqual({ id: 2, url: "good" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("query=ocean+waves");
    expect(String(url)).toContain("orientation=portrait");
    expect(init.headers.Authorization).toBe("KEY");
  });

  it("accepts a landscape file as a last resort", async () => {
    fetchMock.mockResolvedValue(json({ videos: [{ id: 3, video_files: [file(1920, 1080, "wide")] }] }));
    expect((await searchStockFootage("q", "KEY", new Set()))?.url).toBe("wide");
  });

  it("skips videos with no usable file and returns null when nothing fits", async () => {
    fetchMock.mockResolvedValue(json({ videos: [{ id: 4, video_files: [file(1080, 1920, "w", "video/webm")] }] }));
    expect(await searchStockFootage("q", "KEY", new Set())).toBeNull();
  });

  it("returns null on API errors", async () => {
    fetchMock.mockResolvedValue(json({}, false, 429));
    expect(await searchStockFootage("q", "KEY", new Set())).toBeNull();
    fetchMock.mockRejectedValue("network down");
    expect(await searchStockFootage("q", "KEY", new Set())).toBeNull();
  });

  it("downloads footage to disk and rejects on HTTP errors", async () => {
    fetchMock.mockResolvedValue(json({}));
    expect(await downloadFootage("http://x/v.mp4", "/tmp/w/v.mp4")).toBe("/tmp/w/v.mp4");
    expect(fs.mkdirSync).toHaveBeenCalledWith("/tmp/w", { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalled();
    fetchMock.mockResolvedValue(json({}, false, 500));
    await expect(downloadFootage("http://x/v.mp4", "/tmp/w/v.mp4")).rejects.toThrow("500");
  });

  it("fetchSceneFootage searches, downloads and remembers the used video", async () => {
    const used = new Set<number>();
    fetchMock
      .mockResolvedValueOnce(json({ videos: [{ id: 9, video_files: [file(1080, 1920, "http://x/9.mp4")] }] }))
      .mockResolvedValueOnce(json({}));
    expect(await fetchSceneFootage("q", "/tmp/w/s1.mp4", "KEY", used)).toBe("/tmp/w/s1.mp4");
    expect(used.has(9)).toBe(true);
  });

  it("fetchSceneFootage is null when there is no match or the download fails", async () => {
    expect(await fetchSceneFootage("q", "/tmp/s.mp4", undefined, new Set())).toBeNull();
    fetchMock
      .mockResolvedValueOnce(json({ videos: [{ id: 9, video_files: [file(1080, 1920, "http://x/9.mp4")] }] }))
      .mockRejectedValueOnce(new Error("reset"));
    expect(await fetchSceneFootage("q", "/tmp/s.mp4", "KEY", new Set())).toBeNull();
    fetchMock
      .mockResolvedValueOnce(json({ videos: [{ id: 9, video_files: [file(1080, 1920, "http://x/9.mp4")] }] }))
      .mockRejectedValueOnce("string failure");
    expect(await fetchSceneFootage("q", "/tmp/s.mp4", "KEY", new Set())).toBeNull();
  });
});
