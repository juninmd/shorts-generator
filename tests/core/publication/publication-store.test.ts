import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalPool } from "../../../src/core/sqlite-db.js";
import { runControlPlaneMigrations } from "../../../src/core/control-plane-migrations.js";
import { reserveClip } from "../../../src/core/publication/clip-reservation.js";
import { PublicationRepository } from "../../../src/core/publication/publication-repository.js";
import type { SqlClient } from "../../../src/core/control-plane-db.js";

vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const TEXT = "a fé move montanhas quando a gente persevera todos os dias com esperança e coragem";
const base = { channelId: "cat", sourceVideoId: "vid1", sourceUrl: "https://youtu.be/vid1", startSec: 10, endSec: 40, text: TEXT };
const artifact = {
  artifactPath: "/out/a.mp4", subtitlePath: "/out/a.ass", artifactHash: "h1", title: "Título do corte", descriptionBody: "Descrição",
  tags: ["fé"], presenter: null, language: "pt-BR", selectionReason: "forte", reviewNotes: "", requiresHumanReview: false,
};

let db: SqlClient;
let repo: PublicationRepository;

beforeEach(async () => {
  db = getLocalPool({ databaseUrl: "sqlite::memory:" });
  await runControlPlaneMigrations(db);
  repo = new PublicationRepository(db);
});

async function reserved(overrides: Partial<typeof base> = {}) {
  const r = await reserveClip(db, { ...base, ...overrides });
  if (!r.reserved) throw new Error(`not reserved: ${r.reason}`);
  return r.id;
}

describe("clip reservation", () => {
  it("allows only one of many concurrent reservations for the same interval", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => reserveClip(db, base)));
    expect(results.filter((r) => r.reserved)).toHaveLength(1);
  });

  it("blocks overlapping intervals of the same source but not of another channel", async () => {
    await reserved();
    const overlap = await reserveClip(db, { ...base, startSec: 30, endSec: 60, text: "outro texto completamente diferente sobre futebol e esportes radicais" });
    expect(overlap).toMatchObject({ reserved: false, reason: "overlap" });
    expect((await reserveClip(db, { ...base, channelId: "quiz" })).reserved).toBe(true);
  });

  it("blocks near-duplicate text from another source on the same channel", async () => {
    await reserved();
    const dup = await reserveClip(db, { ...base, sourceVideoId: "vid2", text: `${TEXT} sempre` });
    expect(dup).toMatchObject({ reserved: false, reason: "duplicate_text" });
  });

  it("releases the interval after failure and after the lease expires", async () => {
    const id = await reserved();
    await repo.transition(id, ["reserved"], "failed", { error: "render" });
    expect((await reserveClip(db, base)).reserved).toBe(true);

    const other = { ...base, sourceVideoId: "vid3", text: "texto distinto sobre culinária regional mineira e seus queijos artesanais" };
    await reserveClip(db, { ...other, leaseMs: 1 }, new Date("2026-01-01T00:00:00Z"));
    expect((await reserveClip(db, other, new Date("2026-01-01T01:00:00Z"))).reserved).toBe(true);
  });

  it("rejects invalid intervals", () => {
    expect(() => reserveClip(db, { ...base, startSec: 5, endSec: 5 })).toThrow(/invalid interval/);
  });
});

describe("publication state machine", () => {
  it("auto-approves only publish_pending artifacts and never re-attaches", async () => {
    const id = await reserved();
    expect(await repo.attachArtifact(id, artifact, "publish_pending")).toBe(true);
    const p = (await repo.get(id))!;
    expect(p).toMatchObject({ status: "publish_pending", version: 2, approvedVersion: 2, approvedBy: "auto" });
    expect(await repo.attachArtifact(id, artifact, "publish_pending")).toBe(false);
  });

  it("an edit invalidates approval and a stale version cannot be approved", async () => {
    const id = await reserved();
    await repo.attachArtifact(id, artifact, "pending_review");
    expect(await repo.updateDraft(id, 2, { title: "Novo título do corte" })).toBe(true);
    expect(await repo.approve(id, 2, "admin")).toBe(false);
    expect(await repo.approve(id, 3, "admin")).toBe(true);
    expect(await repo.approve(id, 3, "admin")).toBe(false);
    expect(await repo.claimForPublish(id, 3)).toBe(true);
    expect(await repo.claimForPublish(id, 3)).toBe(false);
  });

  it("bound edits move the item to regenerating with a new version", async () => {
    const id = await reserved();
    await repo.attachArtifact(id, artifact, "pending_review");
    await repo.updateDraft(id, 2, { startSec: 12, endSec: 38 });
    expect(await repo.get(id)).toMatchObject({ status: "regenerating", version: 3, sourceStartSec: 12, sourceEndSec: 38, approvedVersion: null });
  });

  it("concurrent approvals of the same version yield one publish claim", async () => {
    const id = await reserved();
    await repo.attachArtifact(id, artifact, "pending_review");
    const approvals = await Promise.all([repo.approve(id, 2, "a"), repo.approve(id, 2, "b"), repo.approve(id, 2, "c")]);
    expect(approvals.filter(Boolean)).toHaveLength(1);
    const claims = await Promise.all([repo.claimForPublish(id, 2), repo.claimForPublish(id, 2)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("lists by channel with bounded pagination", async () => {
    await reserved();
    await reserved({ channelId: "quiz" });
    expect(await repo.list({ channelId: "cat" })).toHaveLength(1);
    expect(await repo.list({ limit: 1000 })).toHaveLength(2);
    expect(await repo.list({ limit: 1, offset: 1 })).toHaveLength(1);
  });
});
