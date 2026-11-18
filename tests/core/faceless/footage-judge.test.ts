import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFootageJudge, isBlockedFootage } from "../../../src/core/faceless/footage-judge.js";
import { generateJsonObject } from "../../../src/core/generate-json.js";

vi.mock("../../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../../src/core/ai-provider.js", () => ({ createModel: vi.fn(() => "model") }));

const cfg = { aiModel: "m", litellmApiKey: "k", litellmBaseUrl: "u" };
const scene = { act: "virada", narration: "O pai correu e abraçou o filho", verse: "correu e o beijou" };
const candidates = [
  { id: 11, url: "u1", description: "woman back hugging a man" },
  { id: 22, url: "u2", description: "father and son together" },
  { id: 33, url: "u3", description: "" },
];

describe("isBlockedFootage", () => {
  it("blocks romantic, party and other off-context themes, not family scenes", () => {
    for (const bad of ["romantic couple at sunset", "wedding bride", "friends at a party", "kissing on a beach", "beer bottles"]) {
      expect(isBlockedFootage(bad)).toBe(true);
    }
    for (const ok of ["father and son together", "wheat field at sunset", "hands praying", "a family embracing"]) {
      expect(isBlockedFootage(ok)).toBe(false);
    }
  });
});

describe("createFootageJudge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks the model for the clip that faithfully illustrates the scene and returns its id", async () => {
    vi.mocked(generateJsonObject).mockResolvedValue({ pick: 1 });
    expect(await createFootageJudge(cfg)(scene, candidates)).toBe(22);
    const options = vi.mocked(generateJsonObject).mock.calls[0]![0];
    expect(options.temperature).toBe(0);
    expect(options.prompt).toContain("O pai correu e abraçou o filho");
    expect(options.prompt).toContain("0: woman back hugging a man");
    expect(options.prompt).toContain("2: (sem descrição)");
    expect(options.prompt).toContain("pai abraçando filho NÃO é casal");
  });

  it("returns null when the model finds none or answers an index that does not exist", async () => {
    vi.mocked(generateJsonObject).mockResolvedValueOnce({ pick: null });
    expect(await createFootageJudge(cfg)(scene, candidates)).toBeNull();
    vi.mocked(generateJsonObject).mockResolvedValueOnce({ pick: 9 });
    expect(await createFootageJudge(cfg)(scene, candidates)).toBeNull();
  });
});
