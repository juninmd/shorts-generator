import path from "node:path";
import { logger } from "../logger.js";
import type { ComicBook, ComicShortResult } from "../comic/comic-types.js";
import type { ComicPipelineConfig } from "../comic/comic-pipeline.js";
import { runComicPipeline } from "../comic/comic-pipeline.js";
import { fetchTrendingRepos, sinceDateISO, type TrendingQuery, type TrendingRepo } from "./github-trending.js";
import { fetchReadme, isMostlyLatin, parseReadme, rawBaseUrl, type ReadmeImage, type ReadmeSection } from "./readme.js";
import { downloadImages, type LocalImage } from "./fetch-images.js";
import { buildRepoBook, safeBookId } from "./script.js";
import { loadUsedRepos, markRepoUsed, usedRepoRegistryPath } from "./repo-registry.js";

export interface TrendingRunOptions {
  outputDir: string;
  windowDays: number;
  minStars: number;
  candidatePool: number;
  maxImages: number;
  token?: string;
  ttsVoice: string;
  watermarkText?: string;
  musicPath?: string;
  verticalWidth: number;
  verticalHeight: number;
}

export interface TrendingDeps {
  searchRepos: (query: TrendingQuery) => Promise<TrendingRepo[]>;
  readReadme: (fullName: string, branch: string) => Promise<string>;
  fetchImages: (images: ReadmeImage[], dir: string, limit: number) => Promise<LocalImage[]>;
  render: (book: ComicBook, config: ComicPipelineConfig) => Promise<ComicShortResult>;
  usedRepos: () => string[];
  markUsed: (fullName: string) => void;
}

export interface TrendingShortResult {
  repo: TrendingRepo;
  short: ComicShortResult;
}

export function defaultTrendingDeps(outputDir: string): TrendingDeps {
  const registry = usedRepoRegistryPath(outputDir);
  return {
    searchRepos: (query) => fetchTrendingRepos(query),
    readReadme: (fullName, branch) => fetchReadme(fullName, branch),
    fetchImages: (images, dir, limit) => downloadImages(images, dir, limit),
    render: (book, config) => runComicPipeline(book, config),
    usedRepos: () => loadUsedRepos(registry),
    markUsed: (fullName) => markRepoUsed(registry, fullName),
  };
}

/** Each README image once, in reading order. */
function uniqueImages(sections: ReadmeSection[]): ReadmeImage[] {
  const seen = new Set<string>();
  return sections.flatMap((section) => section.images).filter((image) => {
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

/**
 * Picks the highest-ranked trending repository not yet narrated, turns its README
 * into a vertical short, and records it so the next week picks another one.
 * A repository without usable screenshots, or one that fails to render, is skipped.
 */
export async function runWeeklyTrendingShort(
  options: TrendingRunOptions,
  deps: TrendingDeps,
): Promise<TrendingShortResult> {
  const candidates = await deps.searchRepos({
    sinceDate: sinceDateISO(options.windowDays),
    minStars: options.minStars,
    perPage: options.candidatePool,
    token: options.token,
  });
  const used = new Set(deps.usedRepos().map((name) => name.toLowerCase()));
  for (const repo of candidates) {
    if (used.has(repo.fullName.toLowerCase())) continue;
    try {
      const sections = parseReadme(await deps.readReadme(repo.fullName, repo.defaultBranch), rawBaseUrl(repo.fullName, repo.defaultBranch));
      const dir = path.join(options.outputDir, "trending", safeBookId(repo.fullName));
      if (!isMostlyLatin(sections)) {
        logger.info({ repo: repo.fullName }, "Skipping trending repo whose README is not Latin-script");
        continue;
      }
      const images = await deps.fetchImages(uniqueImages(sections), dir, options.maxImages);
      if (images.length === 0) {
        logger.info({ repo: repo.fullName }, "Skipping trending repo without usable README images");
        continue;
      }
      const book = buildRepoBook(repo, sections, images);
      const short = await deps.render(book, {
        outputDir: options.outputDir,
        verticalWidth: options.verticalWidth,
        verticalHeight: options.verticalHeight,
        ttsVoice: options.ttsVoice,
        watermarkText: options.watermarkText,
        musicPath: options.musicPath,
      });
      deps.markUsed(repo.fullName);
      return { repo, short };
    } catch (error) {
      logger.warn({ error, repo: repo.fullName }, "Trending repo failed; trying the next one");
    }
  }
  throw new Error("No new trending repository produced a short this week");
}
