import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerAffiliateRoutes } from "../../src/server/admin-affiliate-routes.js";

const valid = { name: "Kindle Colorsoft 16GB", url: "https://link.amazon/B04ZoZmTw" };
const json = (body: unknown, method = "POST") => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("Admin Affiliate Routes", () => {
  let app: Hono;
  let repo: any;

  beforeEach(() => {
    app = new Hono();
    repo = {
      listLinks: vi.fn().mockResolvedValue([{ id: "l1" }]),
      addLink: vi.fn().mockResolvedValue(true),
      setActive: vi.fn().mockResolvedValue(true),
      deleteLink: vi.fn().mockResolvedValue(true),
    };
    registerAffiliateRoutes(app, { affiliateRepository: repo } as any);
  });

  it("GET lists the channel links", async () => {
    const res = await app.request("/channels/akitemquiz/affiliate-links");
    expect(await res.json()).toEqual([{ id: "l1" }]);
    expect(repo.listLinks).toHaveBeenCalledWith("akitemquiz");
  });

  it("POST creates an active link scoped to the channel", async () => {
    const res = await app.request("/channels/akitemquiz/affiliate-links", json(valid));
    expect(res.status).toBe(201);
    expect(repo.addLink).toHaveBeenCalledWith(expect.objectContaining({ channelId: "akitemquiz", ...valid, active: true, position: 0 }));
  });

  it("POST rejects non-https or malformed input and duplicates", async () => {
    expect((await app.request("/channels/akitemquiz/affiliate-links", json({ ...valid, url: "http://x.com/a" }))).status).toBe(400);
    expect((await app.request("/channels/akitemquiz/affiliate-links", json({ name: "" }))).status).toBe(400);
    repo.addLink.mockResolvedValueOnce(false);
    expect((await app.request("/channels/akitemquiz/affiliate-links", json(valid))).status).toBe(409);
  });

  it("PATCH toggles active, validating the body and the link", async () => {
    expect((await app.request("/channels/akitemquiz/affiliate-links/l1", json({ active: false }, "PATCH"))).status).toBe(200);
    expect(repo.setActive).toHaveBeenCalledWith("akitemquiz", "l1", false);
    expect((await app.request("/channels/akitemquiz/affiliate-links/l1", json({ active: "no" }, "PATCH"))).status).toBe(400);
    repo.setActive.mockResolvedValueOnce(false);
    expect((await app.request("/channels/akitemquiz/affiliate-links/l1", json({ active: true }, "PATCH"))).status).toBe(404);
  });

  it("DELETE removes or 404s", async () => {
    expect((await app.request("/channels/akitemquiz/affiliate-links/l1", { method: "DELETE" })).status).toBe(200);
    repo.deleteLink.mockResolvedValueOnce(false);
    expect((await app.request("/channels/akitemquiz/affiliate-links/l1", { method: "DELETE" })).status).toBe(404);
  });
});
