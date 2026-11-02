import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DAY_MS = 86_400_000;

export const cacheEnabled = (): boolean => process.env.ANALYSIS_CACHE !== "false";

export const hashKey = (value: unknown): string =>
  createHash("sha1").update(JSON.stringify(value) ?? "").digest("hex").slice(0, 20);

/** Atomic write: readers never see a half-written file. */
export function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

export function readCache<T>(dir: string, name: string, maxAgeDays = 7): T | null {
  const file = path.join(dir, `${name}.json`);
  try {
    if (Date.now() - fs.statSync(file).mtimeMs > maxAgeDays * DAY_MS) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeCache(dir: string, name: string, value: unknown): void {
  if (cacheEnabled()) writeJsonAtomic(path.join(dir, `${name}.json`), value);
}
