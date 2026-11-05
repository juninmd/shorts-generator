import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalPool } from "../../src/core/sqlite-db.js";
import { runControlPlaneMigrations } from "../../src/core/control-plane-migrations.js";
import { reserveClip } from "../../src/core/publication/clip-reservation.js";
import { PublicationRepository } from "../../src/core/publication/publication-repository.js";
import { registerReviewRoutes } from "../../src/server/admin-review-routes.js";
import { adminErrorHandler } from "../../src/server/admin-quality-routes.js";

vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const SPOKEN = "a oração diária fortalece a fé da família e traz paz para o coração de quem acredita";
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "review-"));
const artifactPath = path.join(outputRoot, "clip.mp4");
fs.writeFileSync(artifactPath, Buffer.from("fake-mp4"));

let app: Hono;
let repo: PublicationRepository;
const enqueuePublication = vi.fn(async () => undefined);
const enqueueRegeneration = vi.fn(async () => undefined);
const refreshStatus = vi.fn(async () => null);

async function seedItem(channelId: string, sourceVideoId: string, file = artifactPath) {
  const r = await reserveClip(db(), { channelId, sourceVideoId, sourceUrl: `https://youtu.be/${sourceVideoId}`, startSec: 10, endSec: 40, text: `${SPOKEN} ${sourceVideoId}`, runId: "run-1" });
  if (!r.reserved) throw new Error("reservation failed");
  await repo.attachArtifact(r.id, {
    artifactPath: file, subtitlePath: "", artifactHash: "h", title: "A oração diária fortalece a fé",
    descriptionBody: "Uma reflexão sobre a oração diária e a fé da família.", tags: ["fé"], presenter: null,
    language: "pt-BR", selectionReason: "mensagem completa", reviewNotes: "", requiresHumanReview: true,
  }, "pending_review");
  return r.id;
}

let sql: ReturnType<typeof getLocalPool>;
const db = () => sql;
const json = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(async () => {
  vi.clearAllMocks();
  sql = getLocalPool({ databaseUrl: "sqlite::memory:" });
  await runControlPlaneMigrations(sql);
  repo = new PublicationRepository(sql);
  app = new Hono();
  app.onError(adminErrorHandler);
  registerReviewRoutes(app, { publications: repo, enqueuePublication, enqueueRegeneration, runRepository: { refreshStatus } } as never, outputRoot);
});

describe("review queue E2E", () => {
  it("lists per channel, previews the artifact and isolates other channels", async () => {
    const catId = await seedItem("catolico", "v1");
    await seedItem("quiz", "v2");
    const list = await (await app.request("/review-items?channelId=catolico&status=pending_review")).json();
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([catId]);
    expect(list.items[0].source.url).toBe("https://youtu.be/v1");

    const video = await app.request(`/review-items/${catId}/video`);
    expect(video.status).toBe(200);
    expect(await video.text()).toBe("fake-mp4");
    expect((await app.request(`/review-items/${catId}?channelId=quiz`)).status).toBe(404);
    expect((await app.request(`/review-items/${catId}/approve?channelId=quiz`, json({ version: 2 }))).status).toBe(404);
  });

  it("refuses to stream artifacts outside the output directory", async () => {
    const id = await seedItem("catolico", "v3", path.join(os.tmpdir(), "outside.mp4"));
    expect((await app.request(`/review-items/${id}/video`)).status).toBe(404);
  });

  it("approves once, enqueues once and treats a repeated approval as idempotent", async () => {
    const id = await seedItem("catolico", "v1");
    const responses = await Promise.all([1, 2, 3].map(() => app.request(`/review-items/${id}/approve`, json({ version: 2 }))));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 202]);
    expect(enqueuePublication).toHaveBeenCalledTimes(1);
    expect(enqueuePublication).toHaveBeenCalledWith({ publicationId: id, version: 2 });
    expect(refreshStatus).toHaveBeenCalledWith("run-1");
  });

  it("edits metadata with validation and requires approval of the new version", async () => {
    const id = await seedItem("catolico", "v1");
    const bad = await app.request(`/review-items/${id}`, { ...json({ expectedVersion: 2, title: "Presenter fala sobre fé" }), method: "PATCH" });
    expect(bad.status).toBe(422);
    const ok = await app.request(`/review-items/${id}`, { ...json({ expectedVersion: 2, title: "A oração diária traz paz ao coração" }), method: "PATCH" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ version: 3, status: "pending_review", approvedVersion: null });
    expect((await app.request(`/review-items/${id}/approve`, json({ version: 2 }))).status).toBe(409);
    expect((await app.request(`/review-items/${id}/approve`, json({ version: 3 }))).status).toBe(202);
  });

  it("bound edits are validated and queue a regeneration", async () => {
    const id = await seedItem("catolico", "v1");
    const tooShort = await app.request(`/review-items/${id}`, { ...json({ expectedVersion: 2, startSec: 10, endSec: 12 }), method: "PATCH" });
    expect(tooShort.status).toBe(422);
    const res = await app.request(`/review-items/${id}`, { ...json({ expectedVersion: 2, startSec: 8, endSec: 45 }), method: "PATCH" });
    expect(await res.json()).toMatchObject({ status: "regenerating", version: 3, source: { startSec: 8, endSec: 45 } });
    expect(enqueueRegeneration).toHaveBeenCalledWith({ publicationId: id, version: 3 });
  });

  it("rejects with a reason and blocks later approval; bad payloads are 400", async () => {
    const id = await seedItem("catolico", "v1");
    expect((await app.request(`/review-items/${id}/reject`, json({ version: 2 }))).status).toBe(400);
    const res = await app.request(`/review-items/${id}/reject`, json({ version: 2, reason: "fora da linha editorial" }));
    expect(await res.json()).toMatchObject({ status: "rejected", reviewNotes: "fora da linha editorial" });
    expect((await app.request(`/review-items/${id}/approve`, json({ version: 2 }))).status).toBe(409);
    expect(enqueuePublication).not.toHaveBeenCalled();
  });

  it("reconciles uncertain uploads only by explicit human input", async () => {
    const id = await seedItem("catolico", "v1");
    expect((await app.request(`/review-items/${id}/reconcile`, json({ notPublished: true }))).status).toBe(409);
    await repo.approve(id, 2, "admin");
    await repo.claimForPublish(id, 2);
    await repo.transition(id, ["publishing"], "reconcile_required");
    const res = await app.request(`/review-items/${id}/reconcile`, json({ notPublished: true }));
    expect(await res.json()).toMatchObject({ status: "pending_review", version: 3, approvedVersion: null });
  });
});
