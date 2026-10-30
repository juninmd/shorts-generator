import { describe, expect, it } from "vitest";
import {
  TP_TOLERANCE_DB,
  buildLoudnormFilter,
  isWithinLoudnessSpec,
  parseLoudnormJson,
  type LoudnessMeasurement,
} from "../../src/core/loudness-measure.js";
import { DELIVERY_SPECS } from "../../src/core/delivery-spec.js";

const spec = DELIVERY_SPECS.shorts!;
const measurement: LoudnessMeasurement = {
  input_i: -21.3,
  input_tp: -3.2,
  input_lra: 6.4,
  input_thresh: -31.7,
  target_offset: 0.1,
};

const json = JSON.stringify({
  input_i: "-21.3", input_tp: "-3.2", input_lra: "6.4", input_thresh: "-31.7", target_offset: "0.1",
});

describe("loudness measurement", () => {
  it("reads loudnorm's JSON out of ffmpeg's log noise", () => {
    expect(parseLoudnormJson(`[Parsed_loudnorm_0] Summary:\n${json}\n`)).toEqual(measurement);
  });

  it("returns null when there is no measurement, bad JSON or silence", () => {
    expect(parseLoudnormJson("")).toBeNull();
    expect(parseLoudnormJson(`{"input_i": }`)).toBeNull();
    expect(parseLoudnormJson(json.replace('"-21.3"', '"-inf"'))).toBeNull();
  });

  it("builds the linear pass-2 filter from the measurements", () => {
    const filter = buildLoudnormFilter(measurement, spec);
    expect(filter).toContain("loudnorm=I=-14:TP=-1:LRA=11");
    expect(filter).toContain("measured_I=-21.3:measured_TP=-3.2");
    expect(filter).toContain("measured_LRA=6.4:measured_thresh=-31.7");
    expect(filter).toContain("offset=0.1:linear=true");
    expect(filter).not.toContain("atrim");
  });

  it("trims the encode back to the input's own length and honours a raised ceiling", () => {
    expect(buildLoudnormFilter(measurement, spec, -2.5, 10.5)).toContain(",atrim=duration=10.500");
    expect(buildLoudnormFilter(measurement, spec, -2.5, 10.5)).toContain("TP=-2.5");
    expect(buildLoudnormFilter(measurement, spec, spec.truePeak, 0)).not.toContain("atrim");
    expect(buildLoudnormFilter(measurement, spec, spec.truePeak, Number.NaN)).not.toContain("atrim");
  });

  it("accepts a file on target and rejects one outside it", () => {
    expect(isWithinLoudnessSpec({ ...measurement, input_i: -14.5, input_tp: -1 }, spec)).toBe(true);
    expect(isWithinLoudnessSpec({ ...measurement, input_i: -16, input_tp: -1 }, spec)).toBe(false);
    expect(isWithinLoudnessSpec({ ...measurement, input_i: -14, input_tp: spec.truePeak + TP_TOLERANCE_DB }, spec)).toBe(true);
    expect(isWithinLoudnessSpec({ ...measurement, input_i: -14, input_tp: spec.truePeak + 0.5 }, spec)).toBe(false);
  });
});
