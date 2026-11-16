import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildSearchUrl,
  fetchTrendingRepos,
  parseSearchResponse,
  sinceDateISO,
} from "../../../src/core/trending/github-trending.js";

const item = {
  full_name: "acme/tool",
  description: "A tool",
  html_url: "https://github.com/acme/tool",
  stargazers_count: 1234,
  language: "Rust",
  default_branch: "main",
};

describe("github-trending", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("computes the window start date", () => {
    expect(sinceDateISO(7, new Date("2026-11-16T12:00:00Z"))).toBe("2026-11-09");
    expect(sinceDateISO(1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("builds a search URL with the date, star floor and ranking", () => {
    const url = new URL(buildSearchUrl({ sinceDate: "2026-11-09", minStars: 100, perPage: 15 }));
    expect(url.origin + url.pathname).toBe("https://api.github.com/search/repositories");
    expect(url.searchParams.get("q")).toBe("created:>2026-11-09 stars:>=100");
    expect(url.searchParams.get("sort")).toBe("stars");
    expect(url.searchParams.get("per_page")).toBe("15");
  });

  it("maps search items to repositories and rejects malformed payloads", () => {
    expect(parseSearchResponse({ items: [item] })).toEqual([{
      fullName: "acme/tool", description: "A tool", htmlUrl: "https://github.com/acme/tool",
      stars: 1234, language: "Rust", defaultBranch: "main",
    }]);
    expect(() => parseSearchResponse({ items: [{ full_name: 1 }] })).toThrow();
  });

  it("fetches with the token when one is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [item] })));
    const repos = await fetchTrendingRepos({ sinceDate: "2026-11-09", minStars: 100, perPage: 5, token: "t" }, fetchImpl);
    expect(repos[0]?.fullName).toBe("acme/tool");
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
  });

  it("fetches without a token through the global fetch by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchTrendingRepos({ sinceDate: "2026-11-09", minStars: 1, perPage: 1 })).resolves.toEqual([]);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("throws when GitHub answers with an error status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(fetchTrendingRepos({ sinceDate: "x", minStars: 1, perPage: 1 }, fetchImpl))
      .rejects.toThrow("HTTP 403");
  });
});
