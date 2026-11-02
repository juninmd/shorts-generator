import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeTranscript } from "../../src/core/analyzer.js";
import { analyzeVideo, withTranscriptCache } from "../../src/core/video-analysis.js";
import type { PipelineConfig, ShortClip, Transcript, VideoInfo } from "../../src/types.js";

vi.mock("../../src/core/analyzer.js", () => ({ analyzeTranscript: vi.fn() }));
vi.mock("../../src/core/audio-signals.js", () => ({ computeAudioSignals: vi.fn(async () => null) }));

const video = { id: "v1", title: "Vídeo", channelName: "Canal", publishedAt: "" } as VideoInfo;
const transcript = { videoId: "v1", duration: 60, language: "pt", fullText: "texto", words: [], segments: [] } as Transcript;
const clip = (id: string) => ({ id, title: id }) as ShortClip;

describe("video analysis", () => {
  let config: PipelineConfig;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANALYSIS_CACHE = "true";
    config = { outputDir: fs.mkdtempSync(path.join(os.tmpdir(), "va-")), minShortDuration: 15 } as PipelineConfig;
  });
  afterEach(() => { process.env.ANALYSIS_CACHE = "false"; });

  it("caches non-empty plans and audits usage, brief and transcript", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([clip("a"), clip("b")]);
    expect(await analyzeVideo(video, transcript, "a.wav", config, 1)).toHaveLength(1);
    expect(await analyzeVideo(video, transcript, "a.wav", config)).toHaveLength(2);
    expect(analyzeTranscript).toHaveBeenCalledTimes(1);
    expect(vi.mocked(analyzeTranscript).mock.calls[0]![3].sourceBrief).toContain("Vídeo");
    const audit = JSON.parse(fs.readFileSync(path.join(config.outputDir, "audit", "v1", "edit_audit.json"), "utf8"));
    expect(audit.stages.analysis).toMatchObject({ cached: true });
    expect(audit.stages.transcript.language).toBe("pt");
  });

  it("never caches an empty plan", async () => {
    vi.mocked(analyzeTranscript).mockResolvedValue([]);
    await analyzeVideo(video, transcript, "a.wav", config);
    await analyzeVideo(video, transcript, "a.wav", config, 0);
    expect(analyzeTranscript).toHaveBeenCalledTimes(2);
  });

  it("transcribes once per video", async () => {
    const transcribe = vi.fn(async () => transcript);
    await withTranscriptCache("v1", config, transcribe);
    expect(await withTranscriptCache("v1", config, transcribe)).toEqual(transcript);
    expect(transcribe).toHaveBeenCalledTimes(1);
    process.env.ANALYSIS_CACHE = "false";
    await withTranscriptCache("v1", config, transcribe);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });
});
