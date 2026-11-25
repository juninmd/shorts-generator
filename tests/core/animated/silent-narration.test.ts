import { describe, it, expect } from "vitest";
import { silentNarration } from "../../../src/core/animated/silent-narration.js";

const base = { id: "c", title: "T", imagePath: "p.png" };

describe("silentNarration", () => {
  it("spaces words evenly so captions stay in sync without a voice", () => {
    const out = silentNarration({ ...base, narrationText: "um  dois\ntres" });
    expect(out.words.map((w) => w.word)).toEqual(["um", "dois", "tres"]);
    expect(out.words[0]!.start).toBe(0);
    expect(out.words[2]!.end).toBeCloseTo(out.durationSec, 6);
    expect(out.audioPath).toBe("");
  });

  it("keeps a minimum duration for very short chapters", () => {
    const out = silentNarration({ ...base, narrationText: "oi" });
    expect(out.durationSec).toBe(2);
  });

  it("returns no words and the minimum duration for empty narration", () => {
    const out = silentNarration({ ...base, narrationText: "   " });
    expect(out.words).toEqual([]);
    expect(out.durationSec).toBe(2);
  });
});
