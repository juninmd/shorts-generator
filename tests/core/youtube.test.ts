import { describe, it, expect, vi } from 'vitest';
import * as youtubeInfo from '../../src/core/youtube-info.js';
import * as youtubeChannel from '../../src/core/youtube-channel.js';
import * as youtubeDownload from '../../src/core/youtube-download.js';
import * as youtubeSection from '../../src/core/youtube-section.js';

import {
  verifyYoutubeAccess,
  getVideoInfo,
  getVideoFileSize,
  getChannelVideos,
  getTopChannelVideos,
  downloadAudioOnly,
  downloadVideoSection,
  cleanupVideo
} from '../../src/core/youtube.js';

describe('youtube barrel', () => {
  it('should re-export verified functions correctly', () => {
    expect(verifyYoutubeAccess).toBeDefined();
    expect(getVideoInfo).toBeDefined();
    expect(getVideoFileSize).toBeDefined();
    expect(getChannelVideos).toBeDefined();
    expect(getTopChannelVideos).toBeDefined();
    expect(downloadAudioOnly).toBeDefined();
    expect(downloadVideoSection).toBeDefined();
    expect(cleanupVideo).toBeDefined();

    expect(verifyYoutubeAccess).toBe(youtubeInfo.verifyYoutubeAccess);
    expect(getVideoInfo).toBe(youtubeInfo.getVideoInfo);
    expect(getVideoFileSize).toBe(youtubeInfo.getVideoFileSize);
    expect(getChannelVideos).toBe(youtubeChannel.getChannelVideos);
    expect(getTopChannelVideos).toBe(youtubeChannel.getTopChannelVideos);
    expect(downloadAudioOnly).toBe(youtubeDownload.downloadAudioOnly);
    expect(downloadVideoSection).toBe(youtubeSection.downloadVideoSection);
    expect(cleanupVideo).toBe(youtubeSection.cleanupVideo);
  });
});
