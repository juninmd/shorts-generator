import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerCutRoutes } from "../../src/server/admin-cut-routes.js";

const validCut = { sourceVideoId: "abc123xyz", title: "Perdão", startSec: 10, endSec: 40 };

describe("Admin Cut Routes", () => {
  let app: Hono;
  let deps: any;

  beforeEach(() => {
    app = new Hono();
    deps = {
      cutsRepository: {
        listCuts: vi.fn().mockResolvedValue([{ id: "c1" }]),
        addCut: vi.fn().mockResolvedValue(undefined),
        deleteCut: vi.fn().mockResolvedValue(true),
      },
      analysisRepository: {
        getAnalysis: vi.fn().mockResolvedValue(null),
      },
    };
    registerCutRoutes(app, deps);
  });

  it("GET lists manual cuts of a channel", async () => {
    const res = await app.request("/channels/canal-01/cuts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "c1" }]);
    expect(deps.cutsRepository.listCuts).toHaveBeenCalledWith("canal-01");
  });

  it("POST stores a valid cut and returns 201 with an id", async () => {
    const res = await app.request("/channels/canal-01/cuts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validCut),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toEqual(expect.any(String));
    expect(deps.cutsRepository.addCut).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "canal-01", startSec: 10, endSec: 40, title: "Perdão" }),
    );
  });

  it("POST rejects cuts outside 3-180 seconds", async () => {
    const res = await app.request("/channels/canal-01/cuts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validCut, startSec: 10, endSec: 11 }),
    });
    expect(res.status).toBe(400);
    expect(deps.cutsRepository.addCut).not.toHaveBeenCalled();
  });

  it("DELETE returns 404 when the cut does not belong to the channel", async () => {
    deps.cutsRepository.deleteCut.mockResolvedValueOnce(false);
    const res = await app.request("/channels/canal-01/cuts/zzz", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("DELETE removes a cut", async () => {
    const res = await app.request("/channels/canal-01/cuts/c1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(deps.cutsRepository.deleteCut).toHaveBeenCalledWith("canal-01", "c1");
  });

  it("GET analysis returns 404 when the source has no analysis yet", async () => {
    const res = await app.request("/channels/canal-01/analysis/abc123xyz");
    expect(res.status).toBe(404);
  });

  it("GET analysis returns the stored analysis", async () => {
    deps.analysisRepository.getAnalysis.mockResolvedValueOnce({ sourceVideoId: "abc123xyz" });
    const res = await app.request("/channels/canal-01/analysis/abc123xyz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sourceVideoId: "abc123xyz" });
  });
});
