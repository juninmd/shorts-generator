import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyticsSource, publicSource, classifyMetricsError } from "../../../src/core/feedback/metrics-sources.js";

const { mockQuery, mockSetCredentials, mockGetYouTubeAuth, mockExecFile } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockSetCredentials: vi.fn(),
  mockGetYouTubeAuth: vi.fn(),
  mockExecFile: vi.fn(),
}));

vi.mock("../../../src/core/youtube-auth.service.js", () => ({ getYouTubeAuth: mockGetYouTubeAuth }));

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials = mockSetCredentials; } },
    youtubeAnalytics: vi.fn().mockReturnValue({ reports: { query: mockQuery } }),
  },
}));

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));

const config = {} as any;

describe("classifyMetricsError", () => {
  it("maps 403 + permission-shaped message to no_permission", () => {
    const result = classifyMetricsError({ response: { status: 403 }, message: "insufficient permission" });
    expect(result).toEqual({ status: "no_permission", error: "insufficient permission" });
  });

  it("maps 429 status to quota", () => {
    const result = classifyMetricsError({ response: { status: 429 }, message: "rate limited" });
    expect(result.status).toBe("quota");
  });

  it("maps a quota-shaped message regardless of status", () => {
    const result = classifyMetricsError({ message: "quota exceeded" });
    expect(result.status).toBe("quota");
  });

  it("maps 401 to no_permission", () => {
    const result = classifyMetricsError({ response: { status: 401 }, message: "invalid_grant" });
    expect(result.status).toBe("no_permission");
  });

  it("falls back to error for anything else", () => {
    const result = classifyMetricsError(new Error("boom"));
    expect(result).toEqual({ status: "error", error: "boom" });
  });

  it("stringifies a message-less error value", () => {
    const result = classifyMetricsError("just a string");
    expect(result).toEqual({ status: "error", error: "just a string" });
  });
});

describe("analyticsSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty ok result for no video ids", async () => {
    const result = await analyticsSource([], config);
    expect(result).toEqual({ status: "ok", metrics: new Map() });
    expect(mockGetYouTubeAuth).not.toHaveBeenCalled();
  });

  it("returns unavailable when credentials are not configured", async () => {
    mockGetYouTubeAuth.mockResolvedValue(null);
    const result = await analyticsSource(["v1"], config);
    expect(result.status).toBe("unavailable");
  });

  it("maps analytics rows into snapshots on success", async () => {
    mockGetYouTubeAuth.mockResolvedValue({ clientId: "c", clientSecret: "s", refreshToken: "r" });
    mockQuery.mockResolvedValue({ data: { rows: [["v1", 100, 10, 2, 30.5, 55.2, 3]] } });
    const result = await analyticsSource(["v1"], config);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.metrics.get("v1")).toEqual({
      views: 100, likes: 10, comments: 2, avgViewDurationSec: 30.5, avgViewPercentage: 55.2, subscribersGained: 3, source: "analytics",
    });
  });

  it("classifies a thrown API error", async () => {
    mockGetYouTubeAuth.mockResolvedValue({ clientId: "c", clientSecret: "s", refreshToken: "r" });
    mockQuery.mockRejectedValue({ response: { status: 429 }, message: "quota" });
    const result = await analyticsSource(["v1"], config);
    expect(result.status).toBe("quota");
  });

  it("treats a response with no rows as an empty result", async () => {
    mockGetYouTubeAuth.mockResolvedValue({ clientId: "c", clientSecret: "s", refreshToken: "r" });
    mockQuery.mockResolvedValue({ data: {} });
    const result = await analyticsSource(["v1"], config);
    expect(result).toEqual({ status: "ok", metrics: new Map() });
  });
});

describe("publicSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty ok result for no video ids", async () => {
    const result = await publicSource([], config);
    expect(result).toEqual({ status: "ok", metrics: new Map() });
  });

  it("parses yt-dlp pipe-delimited output", async () => {
    mockExecFile.mockImplementation((...args: any[]) => {
      const callback = args[args.length - 1];
      callback(null, { stdout: "v1|100|10|2\nv2|not-a-number|5|1\n", stderr: "" });
      return {} as any;
    });
    const result = await publicSource(["v1", "v2"], config);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.metrics.get("v1")).toEqual({ views: 100, likes: 10, comments: 2, source: "public" });
    expect(result.metrics.has("v2")).toBe(false);
  });

  it("returns an error result when yt-dlp fails", async () => {
    mockExecFile.mockImplementation((...args: any[]) => {
      const callback = args[args.length - 1];
      callback(new Error("not found"));
      return {} as any;
    });
    const result = await publicSource(["v1"], config);
    expect(result.status).toBe("error");
  });

  it("stringifies a non-Error rejection", async () => {
    mockExecFile.mockImplementation((...args: any[]) => {
      const callback = args[args.length - 1];
      callback("plain string failure");
      return {} as any;
    });
    const result = await publicSource(["v1"], config);
    expect(result).toEqual({ status: "error", error: "plain string failure" });
  });
});
