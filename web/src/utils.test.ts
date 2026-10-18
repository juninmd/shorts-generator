import { parseSources, stringifySources, parseFocuses, stringifyFocuses, dotClass, badgeClass, timeAgo } from "./utils";
import { describe, expect, it, vi } from "vitest";

describe("utils", () => {
  it("should parse sources", () => {
    const raw = "youtube_channel|My Label|myvalue\nyoutube_channel||myvalue2\nyoutube_channel|My Label3|";
    const res = parseSources(raw);
    expect(res).toEqual([
      { kind: "youtube_channel", label: "My Label", value: "myvalue" },
      { kind: "youtube_channel", label: "myvalue2", value: "myvalue2" },
      { kind: "youtube_channel", label: "My Label3", value: "My Label3" }
    ]);

    // test with no kind
    const res2 = parseSources("|label|val");
    expect(res2[0].kind).toBe("youtube_channel");
  });

  it("should stringify sources", () => {
    const bundle: any = { sources: [{ kind: "youtube_channel", label: "l", value: "v" }] };
    expect(stringifySources(bundle)).toBe("youtube_channel|l|v");
  });

  it("should parse focuses", () => {
    const res = parseFocuses("key1|label1\n|label2\nkey3|");
    expect(res).toEqual([
      { key: "key1", label: "label1" },
      { key: "tecnologia", label: "label2" },
      { key: "key3", label: "key3" }
    ]);
  });

  it("should stringify focuses", () => {
    const bundle: any = { focuses: [{ key: "k", label: "l" }] };
    expect(stringifyFocuses(bundle)).toBe("k|l");
  });

  it("should return correct dot class", () => {
    expect(dotClass("processing")).toBe("dot dot-processing");
    expect(dotClass("completed")).toBe("dot dot-completed");
    expect(dotClass("failed")).toBe("dot dot-failed");
    expect(dotClass("other")).toBe("dot dot-pending");
  });

  it("should return correct badge class", () => {
    expect(badgeClass("processing")).toBe("badge badge-amber");
    expect(badgeClass("completed")).toBe("badge badge-green");
    expect(badgeClass("failed")).toBe("badge badge-red");
    expect(badgeClass("other")).toBe("badge badge-slate");
  });

  it("should return time ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2023-01-01T10:00:00.000Z"));
    expect(timeAgo(new Date("2023-01-01T09:59:30.000Z").toISOString())).toBe("30s atrás");
    expect(timeAgo(new Date("2023-01-01T09:30:00.000Z").toISOString())).toBe("30m atrás");
    expect(timeAgo(new Date("2023-01-01T08:00:00.000Z").toISOString())).toBe("2h atrás");
    vi.useRealTimers();
  });

  it("should parse sources null value", () => {
    const res = parseSources("||");
    expect(res[0].label).toBe("");
  });
});
