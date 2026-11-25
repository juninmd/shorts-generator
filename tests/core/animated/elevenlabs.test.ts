import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { alignmentToWords, elevenLabsNarrate } from "../../../src/core/animated/elevenlabs.js";
import { getVideoDuration } from "../../../src/core/video-processor.js";

vi.mock("../../../src/core/video-processor.js", () => ({ getVideoDuration: vi.fn(async () => 1.5) }));

const chapter = { id: "c1", title: "T", imagePath: "p.png", narrationText: "Oi tudo bem" };
const options = { apiKey: "secret-key", voiceId: "voice/1", modelId: "eleven_multilingual_v2" };

describe("alignmentToWords", () => {
  it("groups character timings into words, skipping repeated whitespace", () => {
    const words = alignmentToWords({
      characters: ["O", "i", " ", " ", "t", "u", "d", "o"],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    });
    expect(words).toEqual([
      { word: "Oi", start: 0, end: 0.2 },
      { word: "tudo", start: 0.4, end: 0.8 },
    ]);
  });

  it("returns no words for an empty alignment", () => {
    expect(alignmentToWords({ characters: [], character_start_times_seconds: [], character_end_times_seconds: [] })).toEqual([]);
  });

  it("keeps a trailing word that has no closing whitespace", () => {
    const words = alignmentToWords({
      characters: ["a", "b"],
      character_start_times_seconds: [0, 0.2],
      character_end_times_seconds: [0.2, 0.4],
    });
    expect(words).toEqual([{ word: "ab", start: 0, end: 0.4 }]);
  });
});

describe("elevenLabsNarrate", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "eleven-"));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes the returned MP3 and word timings for the chapter", async () => {
    const audio = Buffer.from("fake-mp3");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        audio_base64: audio.toString("base64"),
        alignment: {
          characters: ["O", "i"],
          character_start_times_seconds: [0, 0.2],
          character_end_times_seconds: [0.2, 0.4],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await elevenLabsNarrate(chapter, dir, options);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/text-to-speech/voice%2F1/with-timestamps");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("secret-key");
    expect(JSON.parse(init.body as string)).toEqual({ text: chapter.narrationText, model_id: "eleven_multilingual_v2" });
    expect(fs.readFileSync(out.audioPath).toString()).toBe("fake-mp3");
    expect(out.durationSec).toBe(1.5);
    expect(out.words).toEqual([{ word: "Oi", start: 0, end: 0.4 }]);
    expect(getVideoDuration).toHaveBeenCalledWith(out.audioPath);
  });

  it("rejects a response without a usable alignment instead of guessing timings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ audio_base64: "", alignment: null }) })));
    await expect(elevenLabsNarrate(chapter, dir, options)).rejects.toThrow("no usable word alignment");
  });

  it("reports only the HTTP status on failure, never the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    const err = await elevenLabsNarrate(chapter, dir, options).catch((e: Error) => e);
    expect((err as Error).message).toBe("ElevenLabs request failed with HTTP 401");
    expect((err as Error).message).not.toContain("secret-key");
  });
});
