import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { registerScheduleRoutes } from "../../src/server/admin-schedule-routes.js";

describe("Admin Schedule Routes", () => {
  let app: Hono;
  let deps: any;
  const post = (body: unknown) =>
    app.request("/channels/canal-01/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    app = new Hono();
    deps = {
      scheduleRepository: {
        listEntries: vi.fn().mockResolvedValue([]),
        addEntry: vi.fn().mockResolvedValue(undefined),
        deleteEntry: vi.fn().mockResolvedValue(true),
      },
      cutsRepository: { listCuts: vi.fn().mockResolvedValue([{ id: "c1" }]) },
    };
    registerScheduleRoutes(app, deps);
  });

  it("GET uses the default 7-day window when from/to are omitted", async () => {
    const res = await app.request("/channels/canal-01/schedule");
    expect(res.status).toBe(200);
    const [, from, to] = deps.scheduleRepository.listEntries.mock.calls[0];
    expect(Date.parse(to) - Date.parse(from)).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("GET honours explicit from/to", async () => {
    await app.request("/channels/canal-01/schedule?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z");
    expect(deps.scheduleRepository.listEntries).toHaveBeenCalledWith(
      "canal-01", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z",
    );
  });

  it("POST programmed entry without cut is stored", async () => {
    const res = await post({ runAt: "2026-11-12T09:00:00.000Z", kind: "programmed" });
    expect(res.status).toBe(201);
    expect(deps.scheduleRepository.addEntry).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "canal-01", cutId: null, kind: "programmed" }),
    );
  });

  it("POST manual entry requires a cut", async () => {
    const res = await post({ runAt: "2026-11-12T09:00:00.000Z", kind: "manual" });
    expect(res.status).toBe(400);
  });

  it("POST rejects a cut that does not belong to the channel", async () => {
    const res = await post({ runAt: "2026-11-12T09:00:00.000Z", kind: "manual", cutId: "outro" });
    expect(res.status).toBe(404);
    expect(deps.scheduleRepository.addEntry).not.toHaveBeenCalled();
  });

  it("POST manual entry with an owned cut is stored", async () => {
    const res = await post({ runAt: "2026-11-12T09:00:00.000Z", kind: "manual", cutId: "c1" });
    expect(res.status).toBe(201);
  });

  it("POST rejects a malformed date", async () => {
    const res = await post({ runAt: "amanhã", kind: "programmed" });
    expect(res.status).toBe(400);
  });

  it("DELETE returns 404 for an unknown entry and 200 for a known one", async () => {
    deps.scheduleRepository.deleteEntry.mockResolvedValueOnce(false);
    expect((await app.request("/channels/canal-01/schedule/x", { method: "DELETE" })).status).toBe(404);
    expect((await app.request("/channels/canal-01/schedule/e1", { method: "DELETE" })).status).toBe(200);
  });
});
