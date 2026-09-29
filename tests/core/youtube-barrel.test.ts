import { describe, it, expect } from 'vitest';
import * as youtube from '../../src/core/youtube.js';
import * as youtubeInfo from "../../src/core/youtube-info.js";
import * as youtubeChannel from "../../src/core/youtube-channel.js";
import * as youtubeDownload from "../../src/core/youtube-download.js";
import * as youtubeSection from "../../src/core/youtube-section.js";

describe('youtube barrel', () => {
  it('should export all required functions with reference equality to natively achieve 100% v8 line coverage', () => {
    expect(youtube.verifyYoutubeAccess).toBe(youtubeInfo.verifyYoutubeAccess);
    expect(youtube.getVideoInfo).toBe(youtubeInfo.getVideoInfo);
    expect(youtube.getVideoFileSize).toBe(youtubeInfo.getVideoFileSize);
    expect(youtube.getChannelVideos).toBe(youtubeChannel.getChannelVideos);
    expect(youtube.getTopChannelVideos).toBe(youtubeChannel.getTopChannelVideos);
    expect(youtube.downloadAudioOnly).toBe(youtubeDownload.downloadAudioOnly);
    expect(youtube.downloadVideoSection).toBe(youtubeSection.downloadVideoSection);
    expect(youtube.cleanupVideo).toBe(youtubeSection.cleanupVideo);
  });
});
