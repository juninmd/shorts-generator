import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createVideoAudit } from "../../src/core/run-audit.js";

describe("run audit", () => {
  it("rewrites edit_audit.json after each stage", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
    const audit = createVideoAudit(dir, { id: "v1", title: "T" });
    audit.checkpoint("transcript", { segments: 3 });
    audit.checkpoint("selection", { approved: 1 });
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "audit", "v1", "edit_audit.json"), "utf8"));
    expect(saved).toMatchObject({ videoId: "v1", stages: { transcript: { segments: 3 }, selection: { approved: 1 } } });
  });

  it("is a no-op without a directory and survives unwritable paths", () => {
    expect(() => createVideoAudit(undefined, { id: "v", title: "T" }).checkpoint("a", {})).not.toThrow();
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "audit-")), "blocker");
    fs.writeFileSync(file, "x");
    expect(() => createVideoAudit(file, { id: "v", title: "T" }).checkpoint("a", {})).not.toThrow();
  });
});
