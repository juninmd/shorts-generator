import { describe, expect, it } from "vitest";
import { buildCutGraph } from "../../src/core/cut-graph.js";

describe("buildCutGraph", () => {
  it("trims video and audio per range, fades the joins and concatenates to [cv][ca]", () => {
    const graph = buildCutGraph([{ start: 0, end: 1.5 }, { start: 3, end: 4 }]);
    expect(graph).toContain("[0:v]trim=start=0.000:end=1.500,setpts=PTS-STARTPTS[cv0]");
    expect(graph).toContain("[0:a]atrim=start=3.000:end=4.000,asetpts=PTS-STARTPTS,afade=t=in:d=0.015,afade=t=out:st=0.985:d=0.015[ca1]");
    expect(graph.endsWith("[cv0][ca0][cv1][ca1]concat=n=2:v=1:a=1[cv][ca]")).toBe(true);
  });

  it("never schedules a fade-out before zero for very short pieces", () => {
    expect(buildCutGraph([{ start: 0, end: 0.01 }])).toContain("afade=t=out:st=0.000");
  });
});
