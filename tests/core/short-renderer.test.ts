import { describe, expect, it } from "vitest";
import { buildSafeFramingFilter } from "../../src/core/short-renderer.js";

describe("short-renderer", () => {
  it("buildSafeFramingFilter keeps the full source image over a blurred fill", () => {
    const filter = buildSafeFramingFilter("C:\\tmp\\clip.ass", 1080, 1920);

    expect(filter).toContain("scale=1080:1920:force_original_aspect_ratio=increase");
    expect(filter).toContain("gblur=sigma=24");
    expect(filter).toContain("scale=1080:1920:force_original_aspect_ratio=decrease");
    expect(filter).toContain("overlay=(W-w)/2:(H-h)/2");
    expect(filter).toContain("ass='C\\:/tmp/clip.ass'");
  });
});
