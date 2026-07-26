import { describe, expect, it } from "vitest";
import { buildAnalysisPrompt } from "../../src/core/analyzer-prompt.js";

describe("analyzer professional prompt", () => {
  it("forces full-transcript coverage and literal hook/payoff evidence", () => {
    const prompt = buildAnalysisPrompt(
      "[0.00-5.00] início\n[60.00-65.00] fim forte",
      "Título",
      "Canal",
      1,
      6,
      15,
      59,
    );

    expect(prompt).toContain("VARREDURA COMPLETA");
    expect(prompt).toContain("terço final");
    expect(prompt).toContain('"hookText"');
    expect(prompt).toContain('"payoffText"');
    expect(prompt).toContain("copiadas literalmente");
  });
});
