import { describe, expect, it, vi, beforeEach } from "vitest";
import { finishDelivery } from "../../src/core/short-delivery.js";
import { normalizeLoudness } from "../../src/core/loudness.js";
import { assertShortMediaQuality } from "../../src/core/short-quality.js";
import { DELIVERY_SPECS } from "../../src/core/delivery-spec.js";
import { logger } from "../../src/core/logger.js";

vi.mock("../../src/core/loudness.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/core/loudness.js")>();
  return { ...actual, normalizeLoudness: vi.fn() };
});
vi.mock("../../src/core/short-quality.js", () => ({ assertShortMediaQuality: vi.fn() }));
vi.mock("../../src/core/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const expected = { duration: 20, width: 1080, height: 1920 };

const loudness = (over: Partial<Awaited<ReturnType<typeof normalizeLoudness>>> = {}) => ({
  normalized: false, lufs: -14, tp: -1.2, encodes: 0, ...over,
});

describe("delivery finisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertShortMediaQuality).mockResolvedValue(undefined);
  });

  it("normalises, verifies and reports a file on target", async () => {
    vi.mocked(normalizeLoudness).mockResolvedValue(loudness({ normalized: true, encodes: 1 }));

    const report = await finishDelivery("out.mp4", expected);

    expect(normalizeLoudness).toHaveBeenCalledWith("out.mp4", DELIVERY_SPECS.shorts);
    expect(assertShortMediaQuality).toHaveBeenCalledWith("out.mp4", expected, DELIVERY_SPECS.shorts);
    expect(report).toMatchObject({ destination: "shorts", normalized: true, loudnessOk: true, warnings: [] });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns and still verifies when the levels are off target", async () => {
    vi.mocked(normalizeLoudness).mockResolvedValue(loudness({ lufs: -9.4, tp: 0.6, encodes: 3 }));

    const report = await finishDelivery("out.mp4", expected);

    expect(report.loudnessOk).toBe(false);
    expect(report.warnings[0]).toContain("-9.4 LUFS / 0.6 dBTP");
    expect(logger.warn).toHaveBeenCalled();
    expect(assertShortMediaQuality).toHaveBeenCalled();
  });

  it("warns when the levels could not be measured", async () => {
    vi.mocked(normalizeLoudness).mockResolvedValue({ normalized: false, lufs: null, tp: null, encodes: 0, reason: "no_audio" });

    const report = await finishDelivery("out.mp4", expected);

    expect(report.loudnessOk).toBeNull();
    expect(report.warnings).toEqual(["loudness not measured for shorts: no_audio"]);
  });

  it("warns when a loudness pass failed even if the level is within tolerance", async () => {
    vi.mocked(normalizeLoudness).mockResolvedValue({
      normalized: true, lufs: -14.1, tp: -1.2, encodes: 1, reason: "late encode failed",
    });

    const report = await finishDelivery("out.mp4", expected);

    expect(report.loudnessOk).toBe(true);
    expect(report.warnings).toEqual(["loudness pass did not complete for shorts: late encode failed"]);
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "late encode failed" }),
      "Delivery verified",
    );
  });

  it("truncates a long ffmpeg reason before it reaches the report", async () => {
    const long = `${"x".repeat(400)}TAIL`;
    vi.mocked(normalizeLoudness).mockResolvedValue({ normalized: false, lufs: null, tp: null, encodes: 0, reason: long });

    const report = await finishDelivery("out.mp4", expected);

    expect(report.warnings[0]).toHaveLength("loudness not measured for shorts: ".length + 200);
  });

  it("names an unexplained missing measurement as unknown", async () => {
    vi.mocked(normalizeLoudness).mockResolvedValue({ normalized: false, lufs: null, tp: null, encodes: 0 });

    const report = await finishDelivery("out.mp4", expected);

    expect(report.warnings).toEqual(["loudness not measured for shorts (unknown)"]);
  });

  it("stays quiet when normalisation was switched off", async () => {
    vi.mocked(normalizeLoudness).mockResolvedValue({ normalized: false, lufs: null, tp: null, encodes: 0, reason: "disabled" });

    const report = await finishDelivery("out.mp4", expected);

    expect(report.warnings).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ destination: "shorts" }), "Delivery verified without a loudness measurement");
  });

  it("propagates a failed delivery gate", async () => {
    vi.mocked(normalizeLoudness).mockResolvedValue(loudness());
    vi.mocked(assertShortMediaQuality).mockRejectedValue(new Error("Short media quality failed: audio stream missing"));

    await expect(finishDelivery("out.mp4", expected)).rejects.toThrow("audio stream missing");
  });
});
