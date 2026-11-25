import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  narrationChain,
  narrateAnimatedChapters,
  narrateWithFallback,
  resolveNarrationConfig,
} from "../../../src/core/animated/narration.js";
import { narrateChapter } from "../../../src/core/comic/comic-tts.js";
import { elevenLabsNarrate } from "../../../src/core/animated/elevenlabs.js";
import { logger } from "../../../src/core/logger.js";
import type { ComicChapter } from "../../../src/core/comic/comic-types.js";

vi.mock("../../../src/core/comic/comic-tts.js", () => ({ narrateChapter: vi.fn() }));
vi.mock("../../../src/core/animated/elevenlabs.js", () => ({ elevenLabsNarrate: vi.fn() }));
vi.mock("../../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

const chapter: ComicChapter = { id: "c1", title: "T", imagePath: "p.png", narrationText: "um dois tres" };
const eleven = { apiKey: "k", voiceId: "v", modelId: "m" };

describe("resolveNarrationConfig", () => {
  it("defaults to edge-tts without ElevenLabs credentials", () => {
    const cfg = resolveNarrationConfig({});
    expect(cfg.provider).toBe("edge");
    expect(cfg.edgeVoice).toBe("pt-BR-AntonioNeural");
    expect(cfg.elevenLabs).toBeUndefined();
  });

  it("selects ElevenLabs when key and voice id are both set", () => {
    const cfg = resolveNarrationConfig({ ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v" });
    expect(cfg.provider).toBe("elevenlabs");
    expect(cfg.elevenLabs).toEqual({ apiKey: "k", voiceId: "v", modelId: "eleven_multilingual_v2" });
  });

  it("does not select ElevenLabs when only the key is set", () => {
    expect(resolveNarrationConfig({ ELEVENLABS_API_KEY: "k" }).provider).toBe("edge");
  });

  it("honours an explicit ANIMATED_VOICE over credentials and ignores unknown values", () => {
    const env = { ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v", ELEVENLABS_MODEL: "m2", COMIC_TTS_VOICE: "x" };
    expect(resolveNarrationConfig({ ...env, ANIMATED_VOICE: " Silent " }).provider).toBe("silent");
    expect(resolveNarrationConfig({ ...env, ANIMATED_VOICE: "nope" }).provider).toBe("elevenlabs");
    expect(resolveNarrationConfig({ ...env, ANIMATED_VOICE: "edge" }).elevenLabs?.modelId).toBe("m2");
    expect(resolveNarrationConfig({ ...env, ANIMATED_VOICE: "edge" }).edgeVoice).toBe("x");
  });

  it("prefers the local Kokoro voice over edge-tts once its model dir is set, but never over ElevenLabs", () => {
    expect(resolveNarrationConfig({ KOKORO_MODEL_DIR: "/m" }).provider).toBe("kokoro");
    const all = { KOKORO_MODEL_DIR: "/m", ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v" };
    expect(resolveNarrationConfig(all).provider).toBe("elevenlabs");
    expect(resolveNarrationConfig({ ANIMATED_VOICE: "kokoro" }).provider).toBe("kokoro");
  });
});

describe("narrationChain", () => {
  it("ends every chain at silent so a run never fails for lack of a voice", () => {
    expect(narrationChain("elevenlabs")).toEqual(["elevenlabs", "edge", "silent"]);
    expect(narrationChain("kokoro")).toEqual(["kokoro", "silent"]);
    expect(narrationChain("edge")).toEqual(["edge", "silent"]);
    expect(narrationChain("silent")).toEqual(["silent"]);
  });
});

describe("narrateWithFallback", () => {
  const fakeNarrated = { ...chapter, audioPath: "a.mp3", durationSec: 3, words: [] };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses ElevenLabs when it succeeds", async () => {
    vi.mocked(elevenLabsNarrate).mockResolvedValue(fakeNarrated);
    const out = await narrateWithFallback(chapter, "dir", { provider: "elevenlabs", edgeVoice: "v", elevenLabs: eleven });
    expect(out).toBe(fakeNarrated);
    expect(narrateChapter).not.toHaveBeenCalled();
  });

  it("falls back to edge-tts when ElevenLabs fails, logging the reason", async () => {
    vi.mocked(elevenLabsNarrate).mockRejectedValue(new Error("ElevenLabs request failed with HTTP 401"));
    vi.mocked(narrateChapter).mockResolvedValue(fakeNarrated);
    const out = await narrateWithFallback(chapter, "dir", { provider: "elevenlabs", edgeVoice: "v", elevenLabs: eleven });
    expect(out).toBe(fakeNarrated);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ provider: "elevenlabs" }), expect.any(String));
  });

  it("treats a missing ElevenLabs config as a failed provider and falls through to silence", async () => {
    vi.mocked(narrateChapter).mockRejectedValue(new Error("edge-tts missing"));
    const out = await narrateWithFallback(chapter, "dir", { provider: "elevenlabs", edgeVoice: "v" });
    expect(out.audioPath).toBe("");
    expect(elevenLabsNarrate).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("routes Kokoro through the shared TTS helper with the kokoro engine", async () => {
    vi.mocked(narrateChapter).mockResolvedValue(fakeNarrated);
    await narrateWithFallback(chapter, "dir", { provider: "kokoro", edgeVoice: "v" });
    expect(narrateChapter).toHaveBeenCalledWith(chapter, "dir", "v", "kokoro");
  });

  it("narrates with the requested provider directly when it is silent", async () => {
    const out = await narrateWithFallback(chapter, "dir", { provider: "silent", edgeVoice: "v" });
    expect(out.audioPath).toBe("");
    expect(narrateChapter).not.toHaveBeenCalled();
  });

  it("keeps later chapters on the fallback voice once a provider has failed", async () => {
    vi.mocked(elevenLabsNarrate).mockRejectedValueOnce(new Error("HTTP 401")).mockResolvedValue(fakeNarrated);
    vi.mocked(narrateChapter).mockResolvedValue(fakeNarrated);
    await narrateAnimatedChapters([chapter, { ...chapter, id: "c2" }], "dir", {
      provider: "elevenlabs",
      edgeVoice: "v",
      elevenLabs: eleven,
    });
    expect(elevenLabsNarrate).toHaveBeenCalledTimes(1);
    expect(narrateChapter).toHaveBeenCalledTimes(2);
  });

  it("narrates each chapter in order", async () => {
    const out = await narrateAnimatedChapters([chapter, { ...chapter, id: "c2" }], "dir", {
      provider: "silent",
      edgeVoice: "v",
    });
    expect(out.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});
