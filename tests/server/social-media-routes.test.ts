import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { registerSocialMediaRoutes } from "../../src/server/social-media-routes.js";

vi.mock("../../src/core/config.js", () => ({ loadConfig: () => ({ outputDir: "/out" }) }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() } };
});

const app = new Hono();
registerSocialMediaRoutes(app);
const NAME = "abcdefghijklmnopqrstuvwx.mp4";

describe("GET /public/social/:name", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves an issued file as video/mp4", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("mp4bytes"));
    const response = await app.request(`/public/social/${NAME}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(await response.text()).toBe("mp4bytes");
    expect(fs.readFileSync).toHaveBeenCalledWith(path.join("/out", "social", NAME));
  });

  it("404s for names that were not issued by the queue (no traversal, wrong shape)", async () => {
    for (const name of ["short.mp4", "..%2Fsecret.mp4", `${NAME.replace(".mp4", ".txt")}`, "a%20b%20cccccccccccccccc.mp4"]) {
      expect((await app.request(`/public/social/${name}`)).status).toBe(404);
    }
    expect(fs.existsSync).not.toHaveBeenCalled();
  });

  it("404s when the file is gone", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect((await app.request(`/public/social/${NAME}`)).status).toBe(404);
  });
});
