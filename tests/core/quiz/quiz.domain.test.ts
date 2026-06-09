import { describe, it, expect } from "vitest";
import { quizSchema } from "../../../src/core/quiz/quiz.domain";

describe("Quiz Domain", () => {
  it("should have quizSchema defined", () => {
    expect(quizSchema).toBeDefined();
  });
});
