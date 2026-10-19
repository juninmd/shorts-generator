import { describe, expect, it, vi } from "vitest";
import { FacelessScriptSchema, generateFacelessScript } from "../../../src/core/faceless/faceless-script.js";
import { generateJsonObject } from "../../../src/core/generate-json.js";

vi.mock("../../../src/core/generate-json.js", () => ({ generateJsonObject: vi.fn() }));
vi.mock("../../../src/core/ai-provider.js", () => ({ createModel: vi.fn(() => "model") }));

const scene = { narration: "Olá", keywords: "city night" };

describe("faceless script", () => {
  it("requires 3 to 10 scenes with narration and keywords", () => {
    expect(FacelessScriptSchema.safeParse({ title: "T", scenes: [scene, scene, scene] }).success).toBe(true);
    expect(FacelessScriptSchema.safeParse({ title: "T", scenes: [scene] }).success).toBe(false);
    expect(FacelessScriptSchema.safeParse({ title: "T", scenes: Array(11).fill(scene) }).success).toBe(false);
    expect(FacelessScriptSchema.safeParse({ title: "T", scenes: [scene, scene, { narration: "x" }] }).success).toBe(false);
  });

  it("asks the LLM for a hook-first script about the topic in the chosen language", async () => {
    const script = { title: "T", scenes: [scene, scene, scene] };
    vi.mocked(generateJsonObject).mockResolvedValue(script);
    const result = await generateFacelessScript(
      "buracos negros", { aiModel: "m", litellmApiKey: "k", litellmBaseUrl: "u" }, "en-US",
    );
    expect(result).toBe(script);
    const options = vi.mocked(generateJsonObject).mock.calls[0]![0];
    expect(options.model).toBe("model");
    expect(options.prompt).toContain('"buracos negros"');
    expect(options.prompt).toContain("Idioma da narração: en-US");
    expect(options.prompt).toContain("gancho");
  });

  it("defaults to Brazilian Portuguese", async () => {
    vi.mocked(generateJsonObject).mockResolvedValue({});
    await generateFacelessScript("x", { aiModel: "m", litellmApiKey: "k", litellmBaseUrl: "u" });
    expect(vi.mocked(generateJsonObject).mock.calls.at(-1)![0].prompt).toContain("pt-BR");
  });
});
