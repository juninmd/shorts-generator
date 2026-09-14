import { describe, it, expect } from 'vitest';
import * as youtube from '../../src/core/youtube.js';
import * as info from '../../src/core/youtube-info.js';
import * as channel from '../../src/core/youtube-channel.js';
import * as download from '../../src/core/youtube-download.js';
import * as section from '../../src/core/youtube-section.js';

describe('youtube barrel', () => {
  it('should export all required functions exactly referencing their source modules', () => {
    expect(youtube.verifyYoutubeAccess).toBe(info.verifyYoutubeAccess);
    expect(youtube.getVideoInfo).toBe(info.getVideoInfo);
    expect(youtube.getVideoFileSize).toBe(info.getVideoFileSize);

    expect(youtube.getChannelVideos).toBe(channel.getChannelVideos);
    expect(youtube.getTopChannelVideos).toBe(channel.getTopChannelVideos);

    expect(youtube.downloadAudioOnly).toBe(download.downloadAudioOnly);

    expect(youtube.downloadVideoSection).toBe(section.downloadVideoSection);
    expect(youtube.cleanupVideo).toBe(section.cleanupVideo);
  });
});
