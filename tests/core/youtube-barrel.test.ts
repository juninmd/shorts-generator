import { describe, it, expect } from 'vitest';
import * as youtube from '../../src/core/youtube.js';

describe('youtube barrel module mapping test', () => {
    it('forces import to be analyzed', () => {
        expect(youtube.verifyYoutubeAccess).toBeDefined();
        expect(youtube.getVideoInfo).toBeDefined();
        expect(youtube.getVideoFileSize).toBeDefined();
        expect(youtube.getChannelVideos).toBeDefined();
        expect(youtube.getTopChannelVideos).toBeDefined();
        expect(youtube.downloadAudioOnly).toBeDefined();
        expect(youtube.downloadVideoSection).toBeDefined();
        expect(youtube.cleanupVideo).toBeDefined();
    });
});
