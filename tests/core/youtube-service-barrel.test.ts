import { describe, it, expect } from 'vitest';
import * as youtubeService from '../../src/core/youtube.service.js';
import * as youtubeMetadata from '../../src/core/youtube-metadata.service.js';
import * as youtubeAuth from '../../src/core/youtube-auth.service.js';
import * as youtubeComment from '../../src/core/youtube-comment.service.js';
import * as youtubeUpload from '../../src/core/youtube-upload.service.js';

describe('youtube.service barrel', () => {
  it('should export all required functions', () => {
    expect(youtubeService.generateYoutubeMetadata).toBe(youtubeMetadata.generateYoutubeMetadata);
    expect(youtubeService.validateYouTubeToken).toBe(youtubeAuth.validateYouTubeToken);
    expect(youtubeService.getYouTubeAuth).toBe(youtubeAuth.getYouTubeAuth);
    expect(youtubeService.buildEngagementComment).toBe(youtubeComment.buildEngagementComment);
    expect(youtubeService.addCommentToVideo).toBe(youtubeComment.addCommentToVideo);
    expect(youtubeService.uploadToYouTube).toBe(youtubeUpload.uploadToYouTube);
    expect(youtubeService.uploadFullVideoToYouTube).toBe(youtubeUpload.uploadFullVideoToYouTube);
  });
});
