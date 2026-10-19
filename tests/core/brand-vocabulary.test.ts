import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import { applyBrandVocabulary, correctToken, loadBrandVocabulary } from "../../src/core/brand-vocabulary.js";
import type { Transcript } from "../../src/types.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() } };
});

describe("loadBrandVocabulary", () => {
  beforeEach(() => { delete process.env.BRAND_VOCABULARY; delete process.env.BRAND_VOCABULARY_FILE; });
  afterEach(() => { delete process.env.BRAND_VOCABULARY; delete process.env.BRAND_VOCABULARY_FILE; });

  it("is empty by default", () => {
    expect(loadBrandVocabulary()).toEqual([]);
  });

  it("merges inline terms and the file, dropping duplicates and multi-word entries", () => {
    process.env.BRAND_VOCABULARY = "Kubernetes, LiteLLM ,Padre Paulo";
    process.env.BRAND_VOCABULARY_FILE = "terms.txt";
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("LiteLLM\r\nWhisper\n\n");
    expect(loadBrandVocabulary()).toEqual(["Kubernetes", "LiteLLM", "Whisper"]);
  });

  it("ignores a missing file", () => {
    process.env.BRAND_VOCABULARY_FILE = "missing.txt";
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(loadBrandVocabulary()).toEqual([]);
  });
});

describe("correctToken", () => {
  const terms = ["Kubernetes", "Whisper", "NASA"];

  it("fixes near-miss spellings and keeps punctuation", () => {
    expect(correctToken("Cubernetes,", terms)).toBe("Cubernetes,");
    expect(correctToken("Kubernets,", terms)).toBe("Kubernetes,");
    expect(correctToken("\"whisper\"", terms)).toBe("\"Whisper\"");
    expect(correctToken("nasa", terms)).toBe("NASA");
  });

  it("leaves unrelated, very short and empty tokens alone", () => {
    expect(correctToken("water", terms)).toBe("water");
    expect(correctToken("na", terms)).toBe("na");
    expect(correctToken("...", terms)).toBe("...");
  });

  it("is accent-insensitive", () => {
    expect(correctToken("católica", ["Catolica"])).toBe("Catolica");
  });
});

describe("applyBrandVocabulary", () => {
  const transcript: Transcript = {
    videoId: "v", duration: 5, language: "pt", fullText: "o kubernets roda",
    segments: [{ start: 0, end: 5, text: "o kubernets roda" }],
    words: [{ word: "kubernets", start: 1, end: 2 }],
  };

  it("rewrites words, segments and full text", () => {
    const fixed = applyBrandVocabulary(transcript, ["Kubernetes"]);
    expect(fixed.words[0]!.word).toBe("Kubernetes");
    expect(fixed.segments[0]!.text).toBe("o Kubernetes roda");
    expect(fixed.fullText).toBe("o Kubernetes roda");
    expect(transcript.words[0]!.word).toBe("kubernets");
  });

  it("returns the transcript untouched without terms", () => {
    expect(applyBrandVocabulary(transcript, [])).toBe(transcript);
  });
});
