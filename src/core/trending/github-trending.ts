import { z } from "zod";

/**
 * GitHub has no public "trending" endpoint (github.com/trending is HTML only),
 * so trending is approximated with the search API: repositories created inside
 * the window, ordered by stars. That surfaces what is rising this week.
 */
export interface TrendingRepo {
  fullName: string;
  description: string | null;
  htmlUrl: string;
  stars: number;
  language: string | null;
  defaultBranch: string;
}

export interface TrendingQuery {
  /** Only repositories created on or after this date (YYYY-MM-DD). */
  sinceDate: string;
  minStars: number;
  perPage: number;
  token?: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const repoSchema = z.object({
  full_name: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  stargazers_count: z.number(),
  language: z.string().nullable(),
  default_branch: z.string(),
});

const searchSchema = z.object({ items: z.array(repoSchema) });

/** Date `days` before `now`, as YYYY-MM-DD (the format the search qualifier takes). */
export function sinceDateISO(days: number, now: Date = new Date()): string {
  const ms = now.getTime() - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function buildSearchUrl(query: TrendingQuery): string {
  const params = new URLSearchParams({
    q: `created:>${query.sinceDate} stars:>=${query.minStars}`,
    sort: "stars",
    order: "desc",
    per_page: String(query.perPage),
  });
  return `https://api.github.com/search/repositories?${params.toString()}`;
}

export function parseSearchResponse(json: unknown): TrendingRepo[] {
  const parsed = searchSchema.parse(json);
  return parsed.items.map((item) => ({
    fullName: item.full_name,
    description: item.description,
    htmlUrl: item.html_url,
    stars: item.stargazers_count,
    language: item.language,
    defaultBranch: item.default_branch,
  }));
}

export async function fetchTrendingRepos(
  query: TrendingQuery,
  fetchImpl: FetchLike = fetch,
): Promise<TrendingRepo[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "shorts-generator",
  };
  if (query.token) headers.Authorization = `Bearer ${query.token}`;
  const response = await fetchImpl(buildSearchUrl(query), { headers });
  if (!response.ok) {
    throw new Error(`GitHub search failed: HTTP ${response.status}`);
  }
  return parseSearchResponse(await response.json());
}
