import { describe, expect, it } from "vitest";
import { discoverTextualCandidates } from "../../src/core/candidate-discovery.js";
import type { Transcript } from "../../src/types.js";

describe("candidate-discovery", () => {
  it("finds a self-contained high-impact window missed by the LLM", () => {
    const transcript: Transcript = {
      videoId: "fixture",
      duration: 420,
      language: "pt",
      fullText: "",
      words: [],
      segments: [
        { start: 368, end: 375, text: "Essa palavra é importante, mas eu quero falar." },
        { start: 377, end: 383, text: "Tudo que nós falamos hoje é para você." },
        { start: 389, end: 398, text: "Não. A verdade muitas vezes vai doer, mas vai libertar. Ela vai salvar." },
        { start: 399, end: 404, text: "Não tenha medo do Evangelho. Ele fere para curar." },
        { start: 405, end: 410, text: "Escreva aqui nos comentários." },
      ],
    };

    const candidates = discoverTextualCandidates(transcript, 15, 59, 3);

    expect(candidates[0]).toMatchObject({
      startTime: 389,
      endTime: 404,
      hookText: expect.stringContaining("verdade"),
      payoffText: expect.stringContaining("fere para curar"),
    });
  });
});
