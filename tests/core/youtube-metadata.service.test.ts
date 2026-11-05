import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMetadataPrompt, generateYoutubeMetadata, type MetadataGenerator } from "../../src/core/youtube-metadata.service.js";
import { getChannelFeedback } from "../../src/core/viral-feedback.js";

vi.mock("../../src/core/viral-feedback.js", () => ({
  getChannelFeedback: vi.fn().mockResolvedValue(null),
  formatFeedbackForPrompt: vi.fn().mockReturnValue(""),
}));

const SOURCE = "https://www.youtube.com/watch?v=twIo4kE-hsU";
const transcript = [
  { start: 0, end: 10, text: "O padre Paulo Ricardo explica que a oração muda o coração de quem reza todos os dias." },
  { start: 10, end: 20, text: "Talvez a ciência ainda descubra por que isso acontece, mas eu acho que é a graça." },
];

function short(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    clip: { title: "A oração que muda o coração", description: "Padre Paulo Ricardo fala sobre a oração diária.", presenter: "Paulo Ricardo", transcript, hashtags: ["#oracao"], reason: "r", ...overrides },
    originalVideoUrl: SOURCE,
    originalVideoTitle: "Padre Paulo Ricardo - Oração",
    channelName: "Canal",
  } as any;
}

const config = { managedRun: { runId: "r", channelId: "c", channelName: "C", focusLabels: [], editorial: { language: "pt-BR", allowedThemes: [], excludedThemes: [], tone: "", allowedFormats: ["cuts"], publishMode: "auto" } } } as any;
const reply = (payload: unknown): MetadataGenerator => vi.fn().mockResolvedValue(JSON.stringify(payload));

describe("youtube-metadata.service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses validated LLM metadata and keeps the source outside the editable body", async () => {
    const generate = reply({ title: "Como a oração muda o coração de quem reza", description: "Uma reflexão sobre a oração diária e seus frutos.", tags: ["oração", "fé"] });
    const meta = await generateYoutubeMetadata(short(), config, generate);
    expect(meta.held).toBe(false);
    expect(meta.title).toBe("Paulo Ricardo: Como a oração muda o coração de quem reza");
    expect(meta.descriptionBody).not.toContain(SOURCE);
    expect(meta.description).toContain(`🎥 Vídeo Original: ${SOURCE}`);
    expect(meta.tags).toEqual(["shorts", "viral", "oração", "fé"]);
    expect(getChannelFeedback).toHaveBeenCalled();
  });

  it.each(["presenter", "unknown", "null", "Não informado"])("never publishes the textual placeholder %s", async (placeholder) => {
    const generate = reply({ title: `${placeholder}: A oração muda o coração`, description: `Com ${placeholder} falando da oração diária.`, tags: [] });
    const meta = await generateYoutubeMetadata(short({ presenter: placeholder }), config, generate);
    expect(meta.title.toLowerCase()).not.toContain(placeholder.toLowerCase());
    expect(meta.description.toLowerCase()).not.toContain(`apresentador: ${placeholder.toLowerCase()}`);
    expect(meta.presenter).toBeNull();
  });

  it("drops a presenter name that has no evidence in transcript or source", async () => {
    const meta = await generateYoutubeMetadata(short({ presenter: "Frei Gilson" }), config, null);
    expect(meta.presenter).toBeNull();
    expect(meta.title).not.toContain("Gilson");
  });

  it("retries with the rejection reasons when the language is wrong, then accepts the fix", async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ title: "How prayer changes the heart of those who pray", description: "A reflection about the daily prayer and what it does.", tags: [] }))
      .mockResolvedValueOnce(JSON.stringify({ title: "Como a oração muda o coração de quem reza", description: "Uma reflexão sobre a oração de cada dia.", tags: [] }));
    const meta = await generateYoutubeMetadata(short(), config, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0]).toContain("idioma diferente de pt-BR");
    expect(meta.title).toContain("Como a oração");
    expect(meta.held).toBe(false);
  });

  it("rejects titles that turn the speaker's speculation into confirmed fact", async () => {
    const generate = reply({ title: "Ciência confirma: a oração muda o coração", description: "A oração diária e o coração.", tags: [] });
    const meta = await generateYoutubeMetadata(short(), config, generate);
    expect(meta.title).not.toMatch(/confirma/i);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("keeps attribution and falls back safely when the LLM fails", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("litellm 503"));
    const meta = await generateYoutubeMetadata(short(), config, generate);
    expect(meta.held).toBe(false);
    expect(meta.title).toBe("Paulo Ricardo: A oração que muda o coração");
    expect(meta.description).toContain(SOURCE);
  });

  it("holds the clip when neither the LLM nor the fallback are valid", async () => {
    const generate = reply({ title: "unknown", description: "null", tags: [] });
    const meta = await generateYoutubeMetadata(short({ title: "The prayer that changes the heart of the people", description: "This is what the prayer does to you." }), config, generate);
    expect(meta.held).toBe(true);
    expect(meta.heldReasons.join(" ")).toContain("idioma");
    expect(meta.description).toContain(SOURCE);
  });

  it("uses the channel language and the correction list in the prompt", () => {
    const prompt = buildMetadataPrompt(short(), { ...config, managedRun: { ...config.managedRun, editorial: { ...config.managedRun.editorial, language: "es" } } }, null, ["x"]);
    expect(prompt).toContain("SOMENTE em es");
    expect(prompt).toContain("REJEITADA POR: x");
    expect(prompt).toContain("Não cite nome de apresentador");
  });
});
