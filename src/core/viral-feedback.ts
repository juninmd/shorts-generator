

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PipelineConfig } from "../types.js";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

export interface ChannelFeedback {
  topTitles: string[];
  flopTitles: string[];
  medianViews: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: ChannelFeedback | null }>();

/** Resolve the destination channel handle: explicit env config wins, then the
 *  managed channel id when it looks like a YouTube handle slug. */
export function resolveChannelHandle(config: PipelineConfig): string | null {
  if (config.channelHandle) {
    return config.channelHandle.startsWith("@") ? config.channelHandle : `@${config.channelHandle}`;
  }
  const id = config.managedRun?.channelId;
  if (id && /^[a-z0-9._-]{3,30}$/i.test(id)) return `@${id}`;
  return null;
}

/** Fetch what actually performed on the destination channel so prompts can
 *  learn from real outcomes. Fail-safe: any error returns null (prompts
 *  proceed without feedback). Results are cached for 6h per handle. */
export async function getChannelFeedback(config: PipelineConfig): Promise<ChannelFeedback | null> {
  // Never spawn yt-dlp from unit tests — feedback is a best-effort enrichment.
  if (process.env.VITEST || process.env.NODE_ENV === "test") return null;
  const handle = resolveChannelHandle(config);
  if (!handle) return null;

  const cached = cache.get(handle);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  let data: ChannelFeedback | null = null;
  try {
    const { stdout } = await execFileAsync(
      "yt-dlp",
      [
        "--flat-playlist", "--playlist-items", "1:60",
        "--print", "%(view_count)s|%(title)s",
        `https://www.youtube.com/${handle}/shorts`,
      ],
      { timeout: 45_000, maxBuffer: 4 * 1024 * 1024 },
    );

    const rows = stdout
      .split("\n")
      .map((line) => {
        const sep = line.indexOf("|");
        if (sep <= 0) return null;
        const views = parseInt(line.slice(0, sep), 10);
        const title = line.slice(sep + 1).trim();
        if (!Number.isFinite(views) || !title) return null;
        return { views, title };
      })
      .filter((r): r is { views: number; title: string } => r !== null);

    if (rows.length >= 10) {
      const sorted = [...rows].sort((a, b) => b.views - a.views);
      const median = sorted[Math.floor(sorted.length / 2)].views;
      data = {
        topTitles: sorted.slice(0, 8).filter((r) => r.views > median).map((r) => `${r.title} (${r.views} views)`),
        flopTitles: sorted.slice(-8).map((r) => r.title),
        medianViews: median,
      };
    }
  } catch (err) {
    logger.debug({ err, handle }, "viral-feedback: falha ao coletar histórico do canal (ignorado)");
  }

  cache.set(handle, { at: Date.now(), data });
  logger.info({ handle, hasData: !!data, medianViews: data?.medianViews }, "viral-feedback: histórico do canal carregado");
  return data;
}

/** Render the feedback as a prompt block, or empty string when unavailable. */
export function formatFeedbackForPrompt(feedback: ChannelFeedback | null): string {
  if (!feedback || feedback.topTitles.length === 0) return "";
  return `
DADOS REAIS DO CANAL DE DESTINO (aprenda com eles):
Títulos que MAIS performaram — siga este estilo:
${feedback.topTitles.map((t) => `- ${t}`).join("\n")}
Títulos que FRACASSARAM (poucas views) — evite este estilo:
${feedback.flopTitles.map((t) => `- ${t}`).join("\n")}
`;
}


