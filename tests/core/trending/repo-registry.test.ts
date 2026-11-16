import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadUsedRepos, markRepoUsed, usedRepoRegistryPath } from "../../../src/core/trending/repo-registry.js";

describe("repo-registry", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "trend-reg-"));
    file = path.join(dir, "trending", "used-repos.json");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("keeps the registry under the output directory", () => {
    expect(usedRepoRegistryPath("/app/output")).toBe(path.join("/app/output", "trending", "used-repos.json"));
  });

  it("loads an empty list when the file is missing", () => {
    expect(loadUsedRepos(file)).toEqual([]);
  });

  it("ignores a file that is not a JSON array of strings", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"a":1}');
    expect(loadUsedRepos(file)).toEqual([]);
    fs.writeFileSync(file, '["a/b", 3, null]');
    expect(loadUsedRepos(file)).toEqual(["a/b"]);
  });

  it("recovers from invalid JSON", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{broken");
    expect(loadUsedRepos(file)).toEqual([]);
  });

  it("records repositories once, case-insensitively and sorted", () => {
    markRepoUsed(file, "Zed/Last");
    markRepoUsed(file, "acme/tool");
    markRepoUsed(file, "ACME/Tool");
    expect(loadUsedRepos(file)).toEqual(["acme/tool", "zed/last"]);
  });
});
