import { describe, expect, it, afterEach } from "vitest";
import { TITLE_STYLE_GUIDE, buildSocialCopy, resolveTitleStyle, truncateText } from "../../src/core/social-copy.js";

const meta = {
  title: "O segredo dos mineiros presos no Chile",
  description: "Teaser curioso sobre o resgate.\n\n• ponto 1\n• ponto 2\n\n🎥 Vídeo Original: https://x\n📱 Shorts gerado por IA",
  tags: ["shorts", "viral", "nasa", "mineiros chile", "#chile", "nasa", "", "!!"],
};

describe("truncateText", () => {
  it("keeps short text and cuts long text at a word boundary with an ellipsis", () => {
    expect(truncateText("curto", 10)).toBe("curto");
    expect(truncateText("uma frase bem longa para cortar aqui", 20)).toBe("uma frase bem longa…");
    expect(truncateText("palavralongasemespacosnenhum", 10)).toBe("palavralo…");
  });
});

describe("buildSocialCopy", () => {
  it("TikTok: title plus at most 4 de-duplicated hashtags, within 150 characters", () => {
    const copy = buildSocialCopy("tiktok", meta);
    expect(copy.caption).toBe("O segredo dos mineiros presos no Chile\n\n#shorts #viral #nasa #mineiroschile");
    expect(copy.caption.length).toBeLessThanOrEqual(150);
  });

  it("Instagram: title, the description body (without credit lines) and hashtags", () => {
    const copy = buildSocialCopy("instagram", meta);
    expect(copy.caption).toContain("Teaser curioso sobre o resgate.");
    expect(copy.caption).toContain("• ponto 2");
    expect(copy.caption).not.toContain("Vídeo Original");
    expect(copy.caption.endsWith("#shorts #viral #nasa #mineiroschile #chile")).toBe(true);
  });

  it("Threads and Bluesky: just title and a few hashtags", () => {
    expect(buildSocialCopy("threads", meta).caption).toBe("O segredo dos mineiros presos no Chile\n\n#shorts");
    expect(buildSocialCopy("bluesky", meta).caption).toBe("O segredo dos mineiros presos no Chile\n\n#shorts #viral #nasa");
  });

  it("Pinterest: separate title and description fields", () => {
    const copy = buildSocialCopy("pinterest", meta);
    expect(copy.title).toBe(meta.title);
    expect(copy.description).toMatch(/^Teaser curioso/);
    expect(copy.description).toContain("#shorts");
  });

  it("shortens over-long captions while keeping the hashtags", () => {
    const long = { ...meta, title: "Título ".repeat(60).trim() };
    const copy = buildSocialCopy("tiktok", long);
    expect(copy.caption.length).toBeLessThanOrEqual(150);
    expect(copy.caption).toContain("…");
    expect(copy.caption.endsWith("#mineiroschile")).toBe(true);
    expect(buildSocialCopy("instagram", { ...long, description: "d ".repeat(2000) }).caption.length).toBeLessThanOrEqual(2200);
  });

  it("works with no tags and an empty description", () => {
    const copy = buildSocialCopy("pinterest", { title: "Só título", description: "", tags: [] });
    expect(copy.caption).toBe("Só título");
    expect(copy.description).toBe("Só título");
  });
});

describe("resolveTitleStyle", () => {
  afterEach(() => { delete process.env.TITLE_STYLE; });

  it("accepts the known styles case-insensitively and rejects others", () => {
    expect(resolveTitleStyle()).toBeUndefined();
    process.env.TITLE_STYLE = "Curious";
    expect(resolveTitleStyle()).toBe("curious");
    process.env.TITLE_STYLE = "meh";
    expect(resolveTitleStyle()).toBeUndefined();
    expect(Object.keys(TITLE_STYLE_GUIDE)).toEqual(["catchy", "curious", "serious", "question"]);
  });
});
