import { describe, it, expect } from 'vitest';
import * as youtube from '../../src/core/youtube.js';
describe('youtube barrel', () => {
  it('should export all required functions from their respective modules', () => {
    // Check reference equality to correctly validate the newly structured barrel file
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
