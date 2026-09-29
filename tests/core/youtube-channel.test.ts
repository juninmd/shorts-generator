import { describe, it, expect, vi, beforeEach } from "vitest";
import { getChannelVideos, getTopChannelVideos } from "../../src/core/youtube-channel.js";
import { execYtDlp, withCookies } from "../../src/core/youtube-ytdlp.js";

vi.mock("../../src/core/youtube-ytdlp.js", () => ({
  execYtDlp: vi.fn(),
  withCookies: vi.fn(async (_opts, cb) => cb("/tmp/cookies.txt")),
  getYtDlpBaseArgs: vi.fn(() => ["--cookies", "/tmp/cookies.txt"]),
}));

describe("youtube-channel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getChannelVideos fetches and parses video info", async () => {
    const stdout = [
      '{"id":"v1","title":"t1","webpage_url":"u1","channel":"c1","channel_url":"cu1","duration":100,"upload_date":"d1","thumbnail":"th1","live_status":null}',
      '{"id":"v2","duration":NA}',
      '{"id":"v3","duration":200,"live_status":"is_upcoming"}',
      'invalid json',
      '  ',
      ''
    ].join("\n");
    vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout, stderr: "" });

    const result = await getChannelVideos("@channel", 5, 150);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("v1");
  });

  it("getChannelVideos ignores blank lines", async () => {
      const stdout = [
          '{"id":"v1","duration":100}',
          '   ',
          ''
      ].join("\n");
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout, stderr: "" });
      const result = await getChannelVideos("@channel", 5, 150);
      expect(result.length).toBe(1);
  });

  it("getChannelVideos handles empty stdout", async () => {
      const stdout = '   ';
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout, stderr: "" });
      const result = await getChannelVideos("@channel", 5, 150);
      expect(result.length).toBe(0);
  });

  it("getChannelVideos uses raw identifier if http", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: '{"id":"1","duration":10}', stderr: "" });
    await getChannelVideos("http://youtube.com/@channel", 5);
    const args = vi.mocked(execYtDlp).mock.calls[0][0] as string[];
    expect(args[args.length - 1]).toBe("http://youtube.com/@channel");
  });

  it("getChannelVideos handles exec error", async () => {
    vi.mocked(execYtDlp).mockRejectedValueOnce(new Error("fail"));
    const result = await getChannelVideos("@channel", 5);
    expect(result).toEqual([]);
  });

  it("getTopChannelVideos fetches, parses, and sorts by views", async () => {
    const stdout = [
      '{"id":"v1","duration":100,"view_count":50}',
      '{"id":"v2","duration":NA}',
      '{"id":"v3","duration":100,"view_count":200}',
      '{"id":"v4","duration":100,"view_count":null}',
      '{"id":"v5","duration":100}',
      'invalid json',
      '   ',
      ''
    ].join("\n");
    vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout, stderr: "" });

    const result = await getTopChannelVideos("@channel", 5);
    expect(result.length).toBe(4);
    expect(result[0].id).toBe("v3");
    expect(result[1].id).toBe("v1");
  });

  it("getTopChannelVideos handles empty stdout", async () => {
      const stdout = '   ';
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout, stderr: "" });
      const result = await getTopChannelVideos("@channel", 5, 150);
      expect(result.length).toBe(0);
  });

  it("getTopChannelVideos ignores blank lines", async () => {
      const stdout = [
          '{"id":"v1","duration":100}',
          '   ',
          ''
      ].join("\n");
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout, stderr: "" });
      const result = await getTopChannelVideos("@channel", 5);
      expect(result.length).toBe(1);
  });

  it("getTopChannelVideos uses raw identifier if http", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout: '{"id":"1","duration":10}', stderr: "" });
    await getTopChannelVideos("http://youtube.com/@channel", 5);
    const calls = vi.mocked(execYtDlp).mock.calls;
    const args = calls[0][0] as string[];
    expect(args[args.length - 1]).toBe("http://youtube.com/@channel");
  });

  it("getTopChannelVideos handles exec error", async () => {
    vi.mocked(execYtDlp).mockRejectedValueOnce(new Error("fail"));
    const result = await getTopChannelVideos("@channel", 5);
    expect(result).toEqual([]);
  });

  it("getTopChannelVideos handles sorting with missing view counts", async () => {
      const stdout = [
          '{"id":"v1","duration":100}',
          '{"id":"v2","duration":100,"view_count":50}'
      ].join("\n");
      vi.mocked(execYtDlp).mockResolvedValueOnce({ stdout, stderr: "" });
      const result = await getTopChannelVideos("@channel", 5);
      expect(result[0].id).toBe("v2");
      expect(result[1].id).toBe("v1");
  });
});
