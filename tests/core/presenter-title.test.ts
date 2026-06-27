import { describe, expect, it } from "vitest";
import { buildPresenterTitle } from "../../src/core/presenter-title.js";

describe("buildPresenterTitle", () => {
  it("prefixes the presenter name when not already present", () => {
    expect(buildPresenterTitle("O segredo da oração", "Padre Paulo Ricardo"))
      .toBe("Padre Paulo Ricardo: O segredo da oração");
  });

  it("returns the raw title when no presenter is provided", () => {
    expect(buildPresenterTitle("O segredo da oração")).toBe("O segredo da oração");
    expect(buildPresenterTitle("O segredo da oração", "")).toBe("O segredo da oração");
    expect(buildPresenterTitle("O segredo da oração", null)).toBe("O segredo da oração");
  });

  it("does not duplicate the name when already in the title", () => {
    expect(buildPresenterTitle("Padre Paulo revela tudo", "Padre Paulo"))
      .toBe("Padre Paulo revela tudo");
    expect(buildPresenterTitle("PADRE PAULO revela", "padre paulo"))
      .toBe("PADRE PAULO revela");
  });

  it("trims surrounding whitespace", () => {
    expect(buildPresenterTitle("  Título  ", "  Fulano  ")).toBe("Fulano: Título");
  });

  it("prefixes the presenter name even if it is a substring of a word in the title", () => {
    expect(buildPresenterTitle("Semana de oração", "Ana")).toBe("Ana: Semana de oração");
  });
});
