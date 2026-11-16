import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";

/**
 * Repositories already turned into a short, so a weekly run never repeats one.
 * Stored as a JSON array of "owner/name" (lowercased) next to the outputs, which
 * lives on the output PVC in Kubernetes.
 */
export function usedRepoRegistryPath(outputDir: string): string {
  return path.join(outputDir, "trending", "used-repos.json");
}

export function loadUsedRepos(file: string): string[] {
  if (!fs.existsSync(file)) return [];
  try {
    const data: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (!Array.isArray(data)) return [];
    return data.filter((entry): entry is string => typeof entry === "string");
  } catch (error) {
    logger.error({ error, file }, "Failed to read used trending repos; treating as empty");
    return [];
  }
}

export function markRepoUsed(file: string, fullName: string): void {
  const used = new Set(loadUsedRepos(file).map((name) => name.toLowerCase()));
  used.add(fullName.toLowerCase());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify([...used].sort(), null, 2), "utf-8");
}
