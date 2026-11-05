import { afterEach, describe, expect, it } from "vitest";
import { activeImpactProfile } from "../../src/core/impact-profile.js";
import { scoreTextualImpact } from "../../src/core/candidate-discovery.js";

describe("impact profile", () => {
  afterEach(() => {
    delete process.env.IMPACT_PROFILE;
    delete process.env.IMPACT_KEYWORDS;
    delete process.env.WEAK_START_KEYWORDS;
  });

  it("keeps the spiritual vocabulary by default", () => {
    expect(scoreTextualImpact("A cruz salva")).toBeGreaterThan(0);
  });

  it("drops niche vocabulary with IMPACT_PROFILE=generic", () => {
    process.env.IMPACT_PROFILE = "generic";
    expect(scoreTextualImpact("A cruz salva")).toBe(0);
    expect(scoreTextualImpact("Nunca conte esse segredo")).toBe(4);
  });

  it("adds channel keywords from the environment", () => {
    process.env.IMPACT_KEYWORDS = " bitcoin , c++ ,";
    process.env.WEAK_START_KEYWORDS = "bem-vindos";
    const profile = activeImpactProfile();
    expect(scoreTextualImpact("Bitcoin sobe")).toBe(2);
    expect(scoreTextualImpact("Bem-vindos ao bitcoin")).toBe(-4);
    expect(profile.impact.some((pattern) => pattern.test("c++"))).toBe(true);
  });
});
