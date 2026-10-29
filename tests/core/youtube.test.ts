import { describe, it, expect } from 'vitest';
import * as youtubeInfo from '../../src/core/youtube-info.js';
import * as youtubeChannel from '../../src/core/youtube-channel.js';
import * as youtubeDownload from '../../src/core/youtube-download.js';
import * as youtubeSection from '../../src/core/youtube-section.js';

import * as barrel from '../../src/core/youtube.js';

describe('youtube barrel', () => {
  it('should re-export verified functions correctly', () => {
    expect(barrel.verifyYoutubeAccess).toBe(youtubeInfo.verifyYoutubeAccess);
    expect(barrel.getVideoInfo).toBe(youtubeInfo.getVideoInfo);
    expect(barrel.getVideoFileSize).toBe(youtubeInfo.getVideoFileSize);
    expect(barrel.getChannelVideos).toBe(youtubeChannel.getChannelVideos);
    expect(barrel.getTopChannelVideos).toBe(youtubeChannel.getTopChannelVideos);
    expect(barrel.downloadAudioOnly).toBe(youtubeDownload.downloadAudioOnly);
    expect(barrel.downloadVideoSection).toBe(youtubeSection.downloadVideoSection);
    expect(barrel.cleanupVideo).toBe(youtubeSection.cleanupVideo);
  });
});
