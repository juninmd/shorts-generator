import { describe, it, expect } from "vitest";
import { _dummy } from "../../../src/core/comic/comic-types.js";

describe("comic-types", () => {
  it("dummy type test to ensure v8 counts pure types file", () => {
    expect(_dummy).toBeNull();
  });
});
