import { describe, it, expect } from 'vitest';
import * as youtube from '../../src/core/youtube.js';
import * as youtubeInfo from '../../src/core/youtube-info.js';
import * as youtubeChannel from '../../src/core/youtube-channel.js';
import * as youtubeDownload from '../../src/core/youtube-download.js';
import * as youtubeSection from '../../src/core/youtube-section.js';

import * as youtubeService from '../../src/core/youtube.service.js';
import * as metadata from '../../src/core/youtube-metadata.service.js';
import * as auth from '../../src/core/youtube-auth.service.js';
import * as comment from '../../src/core/youtube-comment.service.js';
import * as upload from '../../src/core/youtube-upload.service.js';

describe('youtube barrel', () => {
  it('should re-export youtube functions with reference equality', () => {
    expect(youtube.verifyYoutubeAccess).toBe(youtubeInfo.verifyYoutubeAccess);
    expect(youtube.getVideoInfo).toBe(youtubeInfo.getVideoInfo);
    expect(youtube.getVideoFileSize).toBe(youtubeInfo.getVideoFileSize);
    expect(youtube.getChannelVideos).toBe(youtubeChannel.getChannelVideos);
    expect(youtube.getTopChannelVideos).toBe(youtubeChannel.getTopChannelVideos);
    expect(youtube.downloadAudioOnly).toBe(youtubeDownload.downloadAudioOnly);
    expect(youtube.downloadVideoSection).toBe(youtubeSection.downloadVideoSection);
    expect(youtube.cleanupVideo).toBe(youtubeSection.cleanupVideo);
  });

  it('should re-export youtube service functions with reference equality', () => {
    expect(youtubeService.generateYoutubeMetadata).toBe(metadata.generateYoutubeMetadata);
    expect(youtubeService.validateYouTubeToken).toBe(auth.validateYouTubeToken);
    expect(youtubeService.getYouTubeAuth).toBe(auth.getYouTubeAuth);
    expect(youtubeService.addCommentToVideo).toBe(comment.addCommentToVideo);
    expect(youtubeService.buildEngagementComment).toBe(comment.buildEngagementComment);
    expect(youtubeService.uploadToYouTube).toBe(upload.uploadToYouTube);
    expect(youtubeService.uploadFullVideoToYouTube).toBe(upload.uploadFullVideoToYouTube);
  });
});
