import { describe, it, expect } from 'vitest';
import * as youtube from '../../src/core/youtube.js';
import * as info from '../../src/core/youtube-info.js';
import * as channel from '../../src/core/youtube-channel.js';
import * as download from '../../src/core/youtube-download.js';
import * as section from '../../src/core/youtube-section.js';

import * as youtubeService from '../../src/core/youtube.service.js';
import * as metadata from '../../src/core/youtube-metadata.service.js';
import * as auth from '../../src/core/youtube-auth.service.js';
import * as comment from '../../src/core/youtube-comment.service.js';
import * as upload from '../../src/core/youtube-upload.service.js';

describe('youtube barrel', () => {
  it('should re-export youtube functions correctly', () => {
    expect(youtube.verifyYoutubeAccess).toBe(info.verifyYoutubeAccess);
    expect(youtube.getVideoInfo).toBe(info.getVideoInfo);
    expect(youtube.getVideoFileSize).toBe(info.getVideoFileSize);
    expect(youtube.getChannelVideos).toBe(channel.getChannelVideos);
    expect(youtube.getTopChannelVideos).toBe(channel.getTopChannelVideos);
    expect(youtube.downloadAudioOnly).toBe(download.downloadAudioOnly);
    expect(youtube.downloadVideoSection).toBe(section.downloadVideoSection);
    expect(youtube.cleanupVideo).toBe(section.cleanupVideo);
  });

  it('should re-export youtube.service functions correctly', () => {
    expect(youtubeService.generateYoutubeMetadata).toBe(metadata.generateYoutubeMetadata);
    expect(youtubeService.validateYouTubeToken).toBe(auth.validateYouTubeToken);
    expect(youtubeService.getYouTubeAuth).toBe(auth.getYouTubeAuth);
    expect(youtubeService.buildEngagementComment).toBe(comment.buildEngagementComment);
    expect(youtubeService.addCommentToVideo).toBe(comment.addCommentToVideo);
    expect(youtubeService.uploadToYouTube).toBe(upload.uploadToYouTube);
    expect(youtubeService.uploadFullVideoToYouTube).toBe(upload.uploadFullVideoToYouTube);
  });
});