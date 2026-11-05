import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalPool } from "../../../src/core/sqlite-db.js";
import { runControlPlaneMigrations } from "../../../src/core/control-plane-migrations.js";
import { reserveClip } from "../../../src/core/publication/clip-reservation.js";
import { PublicationRepository } from "../../../src/core/publication/publication-repository.js";
import { hashFile, publishPublication, RetryablePublishError, type PublishDeps } from "../../../src/core/publication/publish-service.js";
import { classifyUploadError, uploadWithOutcome } from "../../../src/core/publication/youtube-publisher.js";
import { regeneratePublication } from "../../../src/core/publication/regenerate.js";

vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../../src/core/state.js", () => ({
  incrementDailyUploadCountAsync: vi.fn(async () => undefined),
  isDailyLimitReachedAsync: vi.fn(async () => false),
  setDailyLimitReachedAsync: vi.fn(async () => undefined),
}));
vi.mock("../../../src/core/youtube-auth.service.js", () => ({ getYouTubeAuth: vi.fn(), validateYouTubeToken: vi.fn(async () => true) }));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-"));
const file = path.join(dir, "clip.mp4");
const SPOKEN = "a oração diária fortalece a fé da família e traz paz para o coração";
let repo: PublicationRepository;
const config = { outputDir: dir } as never;

async function approvedItem() {
  fs.writeFileSync(file, "video-v1");
  const r = await reserveClip(repo["db"], { channelId: "cat", sourceVideoId: "src1", sourceUrl: "https://youtu.be/src1", startSec: 0, endSec: 30, text: SPOKEN });
  if (!r.reserved) throw new Error("not reserved");
  await repo.attachArtifact(r.id, {
    artifactPath: file, subtitlePath: "", artifactHash: await hashFile(file), title: "A oração diária fortalece a fé",
    descriptionBody: "Reflexão sobre a oração e a fé da família.", tags: ["fé"], presenter: null, language: "pt-BR",
    selectionReason: "", reviewNotes: "", requiresHumanReview: false,
  }, "publish_pending");
  return r.id;
}

const deps = (upload: PublishDeps["upload"], extra: Partial<PublishDeps> = {}): PublishDeps =>
  ({ repo, resolveConfig: async () => config, upload, ...extra });

beforeEach(async () => {
  const db = getLocalPool({ databaseUrl: "sqlite::memory:" });
  await runControlPlaneMigrations(db);
  repo = new PublicationRepository(db);
});

describe("publishPublication", () => {
  it("publishes once with the source link and a reconciliation tag", async () => {
    const id = await approvedItem();
    const upload = vi.fn(async () => ({ kind: "published" as const, videoId: "yt123456", url: "https://youtu.be/yt123456" }));
    const afterPublish = vi.fn(async () => undefined);
    expect(await publishPublication(id, 2, deps(upload, { afterPublish }))).toMatchObject({ status: "published" });
    const request = upload.mock.calls[0]![0];
    expect(request.description).toContain("https://youtu.be/src1");
    expect(request.tags.some((t: string) => t.startsWith("sgpub"))).toBe(true);
    expect(await repo.get(id)).toMatchObject({ status: "published", youtubeVideoId: "yt123456" });
    // Duplicate job delivery must not upload again.
    expect(await publishPublication(id, 2, deps(upload))).toMatchObject({ status: "skipped" });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(afterPublish).toHaveBeenCalledTimes(1);
  });

  it("an uncertain upload goes to reconciliation and is never retried automatically", async () => {
    const id = await approvedItem();
    const upload = vi.fn(async () => ({ kind: "uncertain" as const, error: "socket hang up" }));
    expect(await publishPublication(id, 2, deps(upload))).toMatchObject({ status: "reconcile_required" });
    expect(await publishPublication(id, 2, deps(upload))).toMatchObject({ status: "skipped" });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("a rejected-before-creation quota error is retryable and returns to publish_pending", async () => {
    const id = await approvedItem();
    const upload = vi.fn(async () => ({ kind: "not_sent" as const, error: "quota", retryable: true }));
    await expect(publishPublication(id, 2, deps(upload))).rejects.toBeInstanceOf(RetryablePublishError);
    expect((await repo.get(id))!.status).toBe("publish_pending");
  });

  it("refuses an artifact changed after approval and missing credentials are retryable", async () => {
    const id = await approvedItem();
    fs.writeFileSync(file, "tampered");
    const upload = vi.fn();
    expect(await publishPublication(id, 2, deps(upload))).toMatchObject({ status: "failed", detail: "artifact changed after approval" });
    expect(upload).not.toHaveBeenCalled();

    const id2 = await (async () => { await repo["db"].query("DELETE FROM clip_publications"); return approvedItem(); })();
    const noCreds = deps(upload, { resolveConfig: async () => { throw new Error("token revoked"); } });
    await expect(publishPublication(id2, 2, noCreds)).rejects.toThrow(/credentials unavailable/);
    expect((await repo.get(id2))!.status).toBe("publish_pending");
  });
});

describe("youtube publisher classification", () => {
  it.each([
    [{ response: { status: 400 }, message: "bad" }, "not_sent", false],
    [{ response: { status: 403 }, message: "uploadLimitExceeded" }, "not_sent", true],
    [{ code: "ECONNRESET", message: "reset" }, "uncertain", undefined],
    [{ response: { status: 503 }, message: "backend" }, "uncertain", undefined],
  ])("classifies %#", (error, kind, retryable) => {
    const outcome = classifyUploadError(error);
    expect(outcome.kind).toBe(kind);
    if (outcome.kind === "not_sent") expect(outcome.retryable).toBe(retryable);
  });

  it("does not send when disabled or the file is missing and reports a created video", async () => {
    const insert = vi.fn(async () => ({ id: "abc12345" }));
    expect(await uploadWithOutcome({ videoPath: file, title: "t", description: "d", tags: [] }, config, insert))
      .toMatchObject({ kind: "not_sent", retryable: false });
    vi.stubEnv("ENABLE_YOUTUBE", "true");
    expect(await uploadWithOutcome({ videoPath: path.join(dir, "none.mp4"), title: "t", description: "d", tags: [] }, config, insert))
      .toMatchObject({ kind: "not_sent" });
    fs.writeFileSync(file, "x");
    expect(await uploadWithOutcome({ videoPath: file, title: "t", description: "d", tags: [] }, config, insert))
      .toMatchObject({ kind: "published", videoId: "abc12345" });
    insert.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
    expect(await uploadWithOutcome({ videoPath: file, title: "t", description: "d", tags: [] }, config, insert))
      .toMatchObject({ kind: "uncertain" });
    expect(insert).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });
});

describe("regeneratePublication", () => {
  it("fails loudly without a transcript cache and rebuilds when it exists", async () => {
    const id = await approvedItem();
    await repo["db"].query("UPDATE clip_publications SET status = 'regenerating' WHERE id = $1", [id]);
    const render = vi.fn(async () => ({ outputPath: file, subtitlePath: "" }) as never);
    expect(await regeneratePublication(id, 2, { repo, resolveConfig: async () => config, render })).toBe("failed");

    await repo["db"].query("UPDATE clip_publications SET status = 'regenerating' WHERE id = $1", [id]);
    fs.mkdirSync(path.join(dir, "transcripts"), { recursive: true });
    fs.writeFileSync(path.join(dir, "transcripts", "src1.json"), JSON.stringify({ videoId: "src1", duration: 60, segments: [{ start: 0, end: 30, text: SPOKEN }], words: [] }));
    expect(await regeneratePublication(id, 2, { repo, resolveConfig: async () => config, render })).toBe("regenerated");
    expect(await repo.get(id)).toMatchObject({ status: "pending_review", version: 3 });
    expect(await regeneratePublication(id, 2, { repo, resolveConfig: async () => config, render })).toBe("skipped");
  });
});
