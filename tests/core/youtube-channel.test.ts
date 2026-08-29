import { describe, it, expect, vi, beforeEach } from "vitest";
import { getChannelVideos, getTopChannelVideos } from "../../src/core/youtube-channel.js";
import { execYtDlp, getYtDlpBaseArgs, withCookies } from "../../src/core/youtube-ytdlp.js";

vi.mock("../../src/core/youtube-ytdlp.js", () => ({
  getYtDlpBaseArgs: vi.fn(() => []),
  withCookies: vi.fn(async (config, fn) => fn("cookie.txt")),
  execYtDlp: vi.fn(),
}));

vi.mock("../../src/core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe("youtube-channel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getChannelVideos", () => {
    it("getChannelVideos parses yt-dlp output successfully and filters by duration", async () => {
      const mockOutput = '{"id":"vid1","title":"Title","url":"url","channel":"channel","channel_url":"curl","duration":120,"upload_date":"20230101","thumbnail":"thumb","live_status":"none"}\n' +
                         '{"id":"vid2","duration":100000}\n' + // Filtered out by maxDurationSec
                         '{"id":"vid3","duration":50,"live_status":"is_upcoming"}\n' + // Filtered out by live status
                         '{"id":"vid4","duration":NA}'; // Parses NA to null which means duration: 0, filtered out
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: mockOutput, stderr: "" });

      const videos = await getChannelVideos("mychannel", 3, 3600);
      expect(videos).toHaveLength(1);
      expect(videos[0].id).toBe("vid1");
      expect(videos[0].url).toBe("url");
    });

    it("getChannelVideos handles http urls correctly", async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: '{"id":"vid1","title":"Title","duration":120}', stderr: "" });
      const videos = await getChannelVideos("http://youtube.com/c/channel", 3, 3600);
      expect(videos).toHaveLength(1);
      expect(videos[0].url).toBe("https://www.youtube.com/watch?v=vid1");
      expect(videos[0].channelName).toBe("http://youtube.com/c/channel");
    });

    it("getChannelVideos skips invalid lines and empty lines", async () => {
      const mockOutput = '\n{"invalid json"\n{"id":"vid1","duration":120}\n';
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: mockOutput, stderr: "" });

      const videos = await getChannelVideos("mychannel", 3, 3600);
      expect(videos).toHaveLength(1);
    });

    it("getChannelVideos returns empty array on error", async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error("Fail channel fetch"));
      const videos = await getChannelVideos("mychannel", 3);
      expect(videos).toEqual([]);
    });
  });

  describe("getTopChannelVideos", () => {
    it("getTopChannelVideos parses yt-dlp output successfully and sorts by view count", async () => {
      const mockOutput = '{"id":"vid1","duration":120,"view_count":500,"live_status":"none"}\n' +
                         '{"id":"vid2","duration":120,"view_count":1000}\n' +
                         '{"id":"vid3","duration":120,"view_count":NA}\n' +
                         '{"id":"vid4","duration":120,"view_count":null}';
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: mockOutput, stderr: "" });

      const videos = await getTopChannelVideos("mychannel", 3, 3600);
      expect(videos).toHaveLength(4);
      expect(videos[0].id).toBe("vid2"); // 1000
      expect(videos[1].id).toBe("vid1"); // 500
    });

    it("getTopChannelVideos handles http urls correctly", async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: '{"id":"vid1","title":"Title","duration":120,"view_count":10}', stderr: "" });
      const videos = await getTopChannelVideos("http://youtube.com/c/channel", 3, 3600);
      expect(videos).toHaveLength(1);
      expect(videos[0].url).toBe("https://www.youtube.com/watch?v=vid1");
      expect(videos[0].channelName).toBe("http://youtube.com/c/channel");
    });

    it("getTopChannelVideos skips invalid lines and empty lines", async () => {
      const mockOutput = '\n{"invalid json"\n{"id":"vid1","duration":120,"view_count":10}\n';
      vi.mocked(execYtDlp).mockResolvedValue({ stdout: mockOutput, stderr: "" });

      const videos = await getTopChannelVideos("mychannel", 3, 3600);
      expect(videos).toHaveLength(1);
    });

    it("getTopChannelVideos returns empty array on error", async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error("Fail top fetch"));
      const videos = await getTopChannelVideos("mychannel", 3);
      expect(videos).toEqual([]);
    });
  });
});
