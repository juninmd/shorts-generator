import { describe, it, expect, vi } from "vitest";
import {
  AMAZON_DISCLOSURE,
  appendAffiliateBlock,
  buildAffiliateBlock,
  pickAffiliateLinks,
} from "../../src/core/affiliate-links.js";
import { ChannelAffiliateRepository } from "../../src/core/channel-affiliate-repository.js";
import {
  buildEngagementComment,
  buildQuizEngagementComment,
} from "../../src/core/youtube-comment.service.js";

const links = [
  { name: "Kindle", url: "https://link.amazon/a" },
  { name: "Airfryer", url: "https://link.amazon/b" },
  { name: "Notebook", url: "https://link.amazon/c" },
];

describe("pickAffiliateLinks", () => {
  it("is deterministic per seed and returns 2 distinct links", () => {
    const first = pickAffiliateLinks(links, "video-1");
    expect(pickAffiliateLinks(links, "video-1")).toEqual(first);
    expect(first).toHaveLength(2);
    expect(first[0]).not.toEqual(first[1]);
  });

  it("rotates through the whole pool across seeds", () => {
    const seen = new Set(["a", "b", "c", "d", "e", "f", "g"].flatMap((s) => pickAffiliateLinks(links, s).map((l) => l.url)));
    expect(seen.size).toBe(3);
  });

  it("returns what exists when the pool is small or empty", () => {
    expect(pickAffiliateLinks([links[0]!], "x")).toEqual([links[0]]);
    expect(pickAffiliateLinks([], "x")).toEqual([]);
  });
});

describe("buildAffiliateBlock", () => {
  it("renders heading, bullets and the Amazon disclosure", () => {
    const block = buildAffiliateBlock(links, "v", "Achados:");
    expect(block.startsWith("🛒 Achados:\n• ")).toBe(true);
    expect(block).toContain("→ https://link.amazon/");
    expect(block.endsWith(AMAZON_DISCLOSURE)).toBe(true);
  });

  it("is empty without links", () => {
    expect(buildAffiliateBlock(undefined, "v", "h")).toBe("");
    expect(buildAffiliateBlock([], "v", "h")).toBe("");
  });
});

describe("comment builders with affiliate links", () => {
  it("quiz comment appends the block and stays unchanged without links", () => {
    const plain = buildQuizEngagementComment({ perguntas: [1, 2, 3] });
    expect(buildQuizEngagementComment({ perguntas: [1, 2, 3] }, { links: [], seed: "j" })).toBe(plain);
    const withLinks = buildQuizEngagementComment({ perguntas: [1, 2, 3] }, { links, seed: "j" });
    expect(withLinks.startsWith(plain)).toBe(true);
    expect(withLinks).toContain("Achados que a gente curte:");
    expect(withLinks).toContain(AMAZON_DISCLOSURE);
  });

  it("cuts comment uses the faith heading for religious channels, after the original video", () => {
    const text = buildEngagementComment("https://youtu.be/abc", ["Catolicismo"], undefined, { links, seed: "https://youtu.be/abc" });
    expect(text).toContain("🎥 Vídeo original completo: https://youtu.be/abc");
    expect(text.indexOf("🎥")).toBeLessThan(text.indexOf("🛒"));
    expect(text).toContain("Para sua caminhada de fé:");
    expect(buildEngagementComment(undefined, ["Humor"], undefined, { links, seed: "s" })).toContain("Achados que a gente curte:");
  });
});

describe("appendAffiliateBlock", () => {
  it("appends the block to the end of the description, same links as the comment", () => {
    const out = appendAffiliateBlock("Descrição\n\n#shorts", links, "v1", ["Católicos"]);
    expect(out.startsWith("Descrição\n\n#shorts\n\n🛒 Para sua caminhada de fé:")).toBe(true);
    expect(out.endsWith(AMAZON_DISCLOSURE)).toBe(true);
    expect(appendAffiliateBlock("d", links, "v1")).toContain("Achados que a gente curte:");
  });

  it("leaves the description untouched without links", () => {
    expect(appendAffiliateBlock("d", undefined, "v1")).toBe("d");
  });

  it("trims the body, not the block, when the description is at the 5000-byte cap", () => {
    const out = appendAffiliateBlock("á".repeat(4000), links, "v1");
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(5000);
    expect(out.endsWith(AMAZON_DISCLOSURE)).toBe(true);
    expect(out).toContain("https://link.amazon/");
  });
});

describe("ChannelAffiliateRepository", () => {
  const row = { id: "1", channel_id: "ch", name: "Kindle", url: "https://link.amazon/a", active: true, position: 0, created_at: "t" };
  const fakeDb = (rows: unknown[] = [], rowCount: number | undefined = 1) => ({ query: vi.fn().mockResolvedValue({ rows, rowCount }) });

  it("lists links mapped to camelCase and only active ones for runs", async () => {
    const db = fakeDb([row, { ...row, id: "2", url: "u2", active: false }]);
    const repo = new ChannelAffiliateRepository(db);
    expect((await repo.listLinks("ch"))[0]).toEqual({ id: "1", channelId: "ch", name: "Kindle", url: "https://link.amazon/a", active: true, position: 0, createdAt: "t" });
    expect(await repo.listActive("ch")).toEqual([{ name: "Kindle", url: "https://link.amazon/a" }]);
  });

  it("merges channel links with the global pool, channel first and no duplicate URLs", async () => {
    const channelRow = { id: "c1", channel_id: "ch", name: "Kindle do canal", url: "https://link.amazon/a", active: true, position: 1, created_at: "t" };
    const globalRows = [
      { id: "g1", name: "Kindle global", url: "https://link.amazon/a", active: true, position: 1, created_at: "t" },
      { id: "g2", name: "Airfryer", url: "https://link.amazon/b", active: true, position: 2, created_at: "t" },
      { id: "g3", name: "Pausado", url: "https://link.amazon/c", active: false, position: 3, created_at: "t" },
    ];
    const db = {
      query: vi.fn().mockImplementation((sql: string) =>
        Promise.resolve({ rows: sql.includes("channel_affiliate_links") ? [channelRow] : globalRows }),
      ),
    };
    const repo = new ChannelAffiliateRepository(db);
    expect(await repo.listActive("ch")).toEqual([
      { name: "Kindle do canal", url: "https://link.amazon/a" },
      { name: "Airfryer", url: "https://link.amazon/b" },
    ]);
    expect(await repo.listGlobalLinks()).toHaveLength(3);
  });

  it("add / toggle / delete global links report whether a row changed", async () => {
    const link = { id: "g1", name: "n", url: "u", active: true, position: 0, createdAt: "t" };
    expect(await new ChannelAffiliateRepository(fakeDb([], 1)).addGlobalLink(link)).toBe(true);
    expect(await new ChannelAffiliateRepository(fakeDb([], 0)).addGlobalLink(link)).toBe(false);
    expect(await new ChannelAffiliateRepository(fakeDb([], 1)).setGlobalActive("g1", false)).toBe(true);
    expect(await new ChannelAffiliateRepository(fakeDb([], 0)).setGlobalActive("g1", false)).toBe(false);
    expect(await new ChannelAffiliateRepository(fakeDb([], 1)).deleteGlobalLink("g1")).toBe(true);
    expect(await new ChannelAffiliateRepository(fakeDb([], 0)).deleteGlobalLink("g1")).toBe(false);
    const noCount = new ChannelAffiliateRepository({ query: vi.fn().mockResolvedValue({ rows: [] }) });
    expect(await noCount.addGlobalLink(link)).toBe(false);
    expect(await noCount.setGlobalActive("g1", true)).toBe(false);
    expect(await noCount.deleteGlobalLink("g1")).toBe(false);
  });

  it("add / toggle / delete report whether a row changed", async () => {
    const link = { id: "1", channelId: "ch", name: "n", url: "u", active: true, position: 0, createdAt: "t" };
    expect(await new ChannelAffiliateRepository(fakeDb([], 1)).addLink(link)).toBe(true);
    expect(await new ChannelAffiliateRepository(fakeDb([], 0)).addLink(link)).toBe(false);
    expect(await new ChannelAffiliateRepository(fakeDb([], 1)).setActive("ch", "1", false)).toBe(true);
    expect(await new ChannelAffiliateRepository(fakeDb([], 0)).setActive("ch", "1", false)).toBe(false);
    expect(await new ChannelAffiliateRepository(fakeDb([], 1)).deleteLink("ch", "1")).toBe(true);
    const noCount = new ChannelAffiliateRepository({ query: vi.fn().mockResolvedValue({ rows: [] }) });
    expect(await noCount.addLink(link)).toBe(false);
    expect(await noCount.setActive("ch", "1", true)).toBe(false);
    expect(await noCount.deleteLink("ch", "1")).toBe(false);
  });
});
