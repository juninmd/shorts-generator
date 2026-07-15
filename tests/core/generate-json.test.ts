import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { extractJson, generateJsonObject } from "../../src/core/generate-json.js";
import * as aiModule from "ai";

vi.mock("ai", () => ({ generateText: vi.fn() }));

describe("extractJson", () => {
  it("extracts a plain object", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("strips markdown fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("extracts a top-level array", () => {
    expect(extractJson("prefix [1,2,3] suffix")).toBe("[1,2,3]");
  });

  it("handles nested objects and braces inside strings", () => {
    const src = 'noise {"a":{"b":"}"},"c":[1,2]} trailing';
    expect(extractJson(src)).toBe('{"a":{"b":"}"},"c":[1,2]}');
  });

  it("ignores escaped quotes when tracking strings", () => {
    const src = '{"a":"he said \\"hi\\" }"}';
    expect(extractJson(src)).toBe(src);
  });

  it("returns null when no JSON is present", () => {
    expect(extractJson("greeting = 'ola'")).toBeNull();
  });

  it("returns null when the object is never closed (truncated)", () => {
    expect(extractJson('{"a":1,"b":')).toBeNull();
  });
});

describe("generateJsonObject", () => {
  const schema = z.object({ greeting: z.string() });

  beforeEach(() => vi.clearAllMocks());

  it("parses and validates a clean response", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: '{"greeting":"ola"}' } as any);
    const out = await generateJsonObject<{ greeting: string }>({
      model: { id: "m" } as any,
      schema,
      prompt: "p",
    });
    expect(out.greeting).toBe("ola");
  });

  it("appends the JSON-only instruction to the prompt", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: '{"greeting":"ola"}' } as any);
    await generateJsonObject({ model: {} as any, schema, prompt: "BASE" });
    const passed = vi.mocked(aiModule.generateText).mock.calls[0]?.[0].prompt as string;
    expect(passed).toContain("BASE");
    expect(passed).toContain("JSON");
  });

  it("throws when the model returns no JSON", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: "greeting = ola" } as any);
    await expect(generateJsonObject({ model: {} as any, schema, prompt: "p" })).rejects.toThrow(/No JSON found/);
  });

  it("throws when JSON does not match the schema", async () => {
    vi.mocked(aiModule.generateText).mockResolvedValue({ text: '{"greeting":123}' } as any);
    await expect(generateJsonObject({ model: {} as any, schema, prompt: "p" })).rejects.toThrow(/did not match schema/);
  });

  it("retries a failed attempt and returns on the next success", async () => {
    vi.mocked(aiModule.generateText)
      .mockRejectedValueOnce(new Error("stalled/aborted"))
      .mockResolvedValueOnce({ text: '{"greeting":"ola"}' } as any);
    const out = await generateJsonObject<{ greeting: string }>({ model: {} as any, schema, prompt: "p" });
    expect(out.greeting).toBe("ola");
    expect(aiModule.generateText).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxRetries + 1 attempts", async () => {
    vi.mocked(aiModule.generateText).mockRejectedValue(new Error("always stalled"));
    await expect(
      generateJsonObject({ model: {} as any, schema, prompt: "p", maxRetries: 2 }),
    ).rejects.toThrow(/always stalled/);
    expect(aiModule.generateText).toHaveBeenCalledTimes(3);
  });
});
