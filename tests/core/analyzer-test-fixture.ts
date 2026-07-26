import type { PipelineConfig, Transcript } from "../../src/types.js";

export const mockConfig = {
  minShortDuration: 15,
  maxShortDuration: 59,
  aiProvider: "ollama",
  aiModel: "gemma3:1b",
  aiTimeoutMs: 300_000,
  openrouterApiKey: "",
  ollamaBaseUrl: "http://localhost:11434",
  minuteBlockSize: 20,
  maxCutsPerBlock: 10,
} as PipelineConfig;

export const mockTranscript: Transcript = {
  videoId: "vid1",
  duration: 120,
  segments: [
    { start: 0, end: 10, text: "Intro" },
    { start: 10, end: 40, text: "Main point" },
    { start: 40, end: 120, text: "Outro" },
  ],
  words: [],
  fullText: "Intro Main point Outro",
  language: "pt",
};
