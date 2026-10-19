import fs from "node:fs";
import path from "node:path";
import type { BrollCue } from "../types.js";
import { fetchSceneFootage } from "./faceless/stock-footage.js";
import { logger } from "./logger.js";

/** A B-roll cutaway ready to overlay: starts at `at` seconds, runs `duration`. */
export interface ResolvedBroll {
  at: number;
  duration: number;
  path: string;
}

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv"]);
const tokens = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);

/** Best file in the local B-roll library whose name shares the most words with the query. */
export function findLocalBroll(query: string, dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const wanted = new Set(tokens(query));
  const scored = fs.readdirSync(dir)
    .filter((name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .map((name) => ({ name, score: tokens(path.parse(name).name).filter((token) => wanted.has(token)).length }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0] ? path.join(dir, scored[0].name) : null;
}

/**
 * Finds footage for each cue: the local library first (BROLL_DIR, files named
 * after what they show), then Pexels (PEXELS_API_KEY). Cues that overlap an
 * earlier cutaway or find no footage are dropped; BROLL=false disables all.
 */
export async function resolveBroll(
  cues: BrollCue[] | undefined,
  workDir: string,
  clipId: string,
): Promise<ResolvedBroll[]> {
  if (!cues || cues.length === 0 || process.env.BROLL === "false") return [];
  const duration = Number.parseFloat(process.env.BROLL_SECONDS ?? "") || 2.6;
  const limit = Number.parseInt(process.env.BROLL_MAX ?? "", 10) || 3;
  const library = process.env.BROLL_DIR;
  const used = new Set<number>();
  const resolved: ResolvedBroll[] = [];
  for (const cue of [...cues].sort((a, b) => a.at - b.at)) {
    const last = resolved.at(-1);
    if (resolved.length >= limit || (last && cue.at < last.at + last.duration + 1)) continue;
    const file = (library ? findLocalBroll(cue.query, library) : null)
      ?? await fetchSceneFootage(cue.query, path.join(workDir, `${clipId}-broll${resolved.length + 1}.mp4`), process.env.PEXELS_API_KEY, used);
    if (file) resolved.push({ at: cue.at, duration, path: file });
    else logger.debug({ query: cue.query }, "No B-roll footage found for cue");
  }
  return resolved;
}

/**
 * Overlay chain cutting from `input` to each B-roll between its start/end (audio
 * is untouched). B-roll inputs follow `firstInputIndex`, in order. Ends on `output`.
 */
export function buildBrollGraph(
  input: string,
  output: string,
  broll: ResolvedBroll[],
  firstInputIndex: number,
  width: number,
  height: number,
): string {
  const parts: string[] = [];
  let current = input;
  broll.forEach((item, index) => {
    const source = `[${firstInputIndex + index}:v]`;
    const next = index === broll.length - 1 ? output : `[bro${index}]`;
    const end = (item.at + item.duration).toFixed(3);
    parts.push(
      `${source}trim=duration=${item.duration},setpts=PTS-STARTPTS+${item.at.toFixed(3)}/TB,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=30[brv${index}]`,
      `${current}[brv${index}]overlay=enable='between(t\\,${item.at.toFixed(3)}\\,${end})':eof_action=pass${next}`,
    );
    current = next;
  });
  return parts.join(";");
}
