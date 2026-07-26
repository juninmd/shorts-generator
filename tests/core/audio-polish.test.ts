import { describe, expect, it } from "vitest";
import { buildSpeechAudioFilter } from "../../src/core/audio-polish.js";

describe("audio-polish", () => {
  it("cleans speech, controls dynamics, normalizes loudness and softens hard cuts", () => {
    const filter = buildSpeechAudioFilter(30);

    expect(filter).toContain("highpass=f=70");
    expect(filter).toContain("lowpass=f=16000");
    expect(filter).toContain("acompressor=");
    expect(filter).toContain("loudnorm=I=-16:TP=-1.5:LRA=7");
    expect(filter).toContain("afade=t=in:st=0:d=0.08");
    expect(filter).toContain("afade=t=out:st=29.88:d=0.12");
  });
});
