import { describe, it, expect } from "vitest";

// Verify exports to handle coverage quirk in pure barrel files
import * as youtube from "../../src/core/youtube.js";
import { verifyYoutubeAccess, getVideoInfo, getVideoFileSize } from "../../src/core/youtube-info.js";
import { getChannelVideos, getTopChannelVideos } from "../../src/core/youtube-channel.js";
import { downloadAudioOnly } from "../../src/core/youtube-download.js";
import { downloadVideoSection, cleanupVideo } from "../../src/core/youtube-section.js";

describe("youtube barrel", () => {
  it("exports correctly", () => {
    expect(youtube.verifyYoutubeAccess).toBe(verifyYoutubeAccess);
    expect(youtube.getVideoInfo).toBe(getVideoInfo);
    expect(youtube.getVideoFileSize).toBe(getVideoFileSize);
    expect(youtube.getChannelVideos).toBe(getChannelVideos);
    expect(youtube.getTopChannelVideos).toBe(getTopChannelVideos);
    expect(youtube.downloadAudioOnly).toBe(downloadAudioOnly);
    expect(youtube.downloadVideoSection).toBe(downloadVideoSection);
    expect(youtube.cleanupVideo).toBe(cleanupVideo);
  });
});
