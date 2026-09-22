import { beforeEach } from 'vitest';
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/core/youtube-ytdlp.js", () => ({
  getYtDlpBaseArgs: vi.fn(() => []),
  withCookies: vi.fn(async (account, cb) => cb("dummy_cookie_path")),
  execYtDlp: vi.fn()
}));

import { getChannelVideos, getTopChannelVideos } from "../../src/core/youtube-channel.js";
import { execYtDlp } from "../../src/core/youtube-ytdlp.js";

describe("youtube-channel", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(execYtDlp).mockClear(); });

  it("getChannelVideos parses yt-dlp output", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","title":"t1","webpage_url":"u1","channel":"c1","channel_url":"cu1","duration":100,"upload_date":"20230101","thumbnail":"thumb1","live_status":null}
{"id":"v2","duration":NA}
invalid json
`
    } as any);

    const res = await getChannelVideos("mychannel", 10);
    expect(res).toHaveLength(1); // v2 has duration 0 (from NA), filtered out. invalid json skipped.
    expect(res[0].id).toBe("v1");
  });

  it("getChannelVideos handles yt-dlp error", async () => {
    vi.mocked(execYtDlp).mockRejectedValueOnce(new Error("ytdlp error"));
    const res = await getChannelVideos("mychannel", 10);
    expect(res).toEqual([]);
  });

  it("getTopChannelVideos parses yt-dlp output and sorts", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","duration":100,"view_count":50}
{"id":"v2","duration":100,"view_count":150}
{"id":"v3","duration":100,"view_count":NA}
`
    } as any);

    const res = await getTopChannelVideos("mychannel", 10);
    expect(res).toHaveLength(3);
    expect(res[0].id).toBe("v2"); // 150 views
    expect(res[1].id).toBe("v1"); // 50 views
    expect(res[2].id).toBe("v3"); // 0 views
  });

  it("getTopChannelVideos handles yt-dlp error", async () => {
    vi.mocked(execYtDlp).mockRejectedValueOnce(new Error("ytdlp error"));
    const res = await getTopChannelVideos("mychannel", 10);
    expect(res).toEqual([]);
  });
  it("getTopChannelVideos handles sorting with missing viewCount", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","duration":100}
{"id":"v2","duration":100,"view_count":150}
`
    } as any);

    const res = await getTopChannelVideos("mychannel", 10);
    expect(res).toHaveLength(2);
    expect(res[0].id).toBe("v2");
    expect(res[1].id).toBe("v1");
  });
  it("getChannelVideos handles yt-dlp returning live_status as is_upcoming", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","duration":100,"live_status":"is_upcoming"}
{"id":"v2","duration":100,"live_status":"none"}
`
    } as any);

    const res = await getChannelVideos("mychannel", 10);
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("v2");
  });

  it("getTopChannelVideos handles empty lines and empty stdout", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `\n   \n`
    } as any);

    const res = await getTopChannelVideos("mychannel", 10);
    expect(res).toHaveLength(0);
  });
  it("getChannelVideos handles channel string without http", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","duration":100}`
    } as any);

    await getChannelVideos("mychannel", 10);
    const args = vi.mocked(execYtDlp).mock.calls[0][0];
    expect(args).toContain("https://www.youtube.com/mychannel/videos");
  });

  it("getChannelVideos handles channel string with http", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","duration":100}`
    } as any);

    await getChannelVideos("http://youtube.com/mychannel", 10);
    const args = vi.mocked(execYtDlp).mock.calls[0][0];
    expect(args.join(' ')).toContain('http://youtube.com/mychannel');
  });

  it("getTopChannelVideos handles channel string without http", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","duration":100}`
    } as any);

    await getTopChannelVideos("mychannel", 10);
    const args = vi.mocked(execYtDlp).mock.calls[0][0];
    expect(args).toContain("https://www.youtube.com/mychannel/videos");
  });

  it("getTopChannelVideos handles channel string with http", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","duration":100}`
    } as any);

    await getTopChannelVideos("http://youtube.com/mychannel", 10);
    const args = vi.mocked(execYtDlp).mock.calls[0][0];
    expect(args.join(' ')).toContain('http://youtube.com/mychannel');
  });

});

  it("getTopChannelVideos handles parse error", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","duration":100}\ninvalid\n{"id":"v2","duration":100,"view_count":150}`
    } as any);

    const res = await getTopChannelVideos("mychannel", 10);
    expect(res).toHaveLength(2);
  });

  it("getChannelVideos handles empty lines in stdout inside loop", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","duration":100}\n   \n{"id":"v2","duration":100}`
    } as any);

    const res = await getChannelVideos("mychannel", 10);
    expect(res).toHaveLength(2);
  });

  it("getTopChannelVideos handles missing duration in yt-dlp output", async () => {
    vi.mocked(execYtDlp).mockResolvedValueOnce({
      stdout: `{"id":"v1","view_count":100}`
    } as any);

    const res = await getTopChannelVideos("mychannel", 10);
    expect(res).toHaveLength(0); // Because duration is 0, it gets filtered out
  });
