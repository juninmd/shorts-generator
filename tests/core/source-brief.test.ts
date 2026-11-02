import { describe, expect, it } from "vitest";
import { buildSourceBrief } from "../../src/core/source-brief.js";

describe("source brief", () => {
  it("keeps title, channel, date and a link-free trimmed description", () => {
    const brief = buildSourceBrief({
      title: "Fé e razão", channelName: "Canal", publishedAt: "20260101",
      description: `Veja https://x.com/a em ${"palavra ".repeat(200)}`,
    });
    expect(brief).toContain('"Fé e razão"');
    expect(brief).toContain("20260101");
    expect(brief).not.toContain("https://");
    expect(brief.length).toBeLessThan(900);
  });

  it("omits the optional parts when missing", () => {
    const brief = buildSourceBrief({ title: "T", channelName: "C", publishedAt: "" });
    expect(brief).not.toContain("Descrição");
    expect(brief).not.toContain("publicado");
  });
});
