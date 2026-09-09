import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadAudioOnly } from '../../src/core/youtube-download.js';
import { execYtDlp, diagnoseAudioDownloadFailure } from '../../src/core/youtube-ytdlp.js';
import fs from 'fs';
import path from 'path';

vi.mock('../../src/core/youtube-ytdlp.js', () => ({
  execYtDlp: vi.fn(),
  getYtDlpBaseArgs: vi.fn().mockReturnValue([]),
  withCookies: vi.fn().mockImplementation(async (config, callback) => callback('mock-cookie')),
  diagnoseAudioDownloadFailure: vi.fn().mockReturnValue('download_video_stream')
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        default: {
            ...actual,
            mkdirSync: vi.fn(),
            existsSync: vi.fn().mockReturnValue(true),
            readdirSync: vi.fn().mockReturnValue([]),
            statSync: vi.fn().mockReturnValue({ size: 1000 })
        }
    };
});

describe('youtube-download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockVideo = { id: 'vid1', title: 'Test Video', url: 'http://test', description: '', duration: 10, channel: 'Ch', upload_date: '20230101' };
  const mockConfig = { tempDir: '/tmp' } as any;

  it('should download audio successfully', async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stderr: 'ok', stdout: '' } as any);
    const result = await downloadAudioOnly(mockVideo, mockConfig);
    expect(result.audioPath).toBe(path.join('/tmp/vid1/vid1.wav'));
    expect(execYtDlp).toHaveBeenCalled();
  });

  it('should log warning if file size is too small', async () => {
    vi.mocked(execYtDlp).mockResolvedValue({ stderr: 'ok', stdout: '' } as any);
    vi.mocked(fs.statSync).mockReturnValue({ size: 500 } as any); // < 1000
    const result = await downloadAudioOnly(mockVideo, mockConfig);
    expect(result.fileSize).toBe(500);
  });

  it('should throw error if file is missing (ERROR)', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stderr: 'ERROR: connection failed', stdout: '' } as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue(['vid1.part']);

      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO EXTRACTION FAILED');
  });

  it('should throw error if file is missing (ffmpeg)', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stderr: 'ffmpeg failed', stdout: '' } as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue(['vid1.part']);

      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO EXTRACTION FAILED');
  });

  it('should throw error if file is missing (Post-processor)', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stderr: 'Post-processor error', stdout: '' } as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue(['vid1.part']);

      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO EXTRACTION FAILED');
  });

  it('should throw error if file is missing (WARNING)', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stderr: 'WARNING: connection slow', stdout: '' } as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue(['vid1.part']);

      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO EXTRACTION FAILED');
  });

  it('should throw error if file is missing (unknown)', async () => {
      vi.mocked(execYtDlp).mockResolvedValue({ stderr: 'just weird output', stdout: '' } as any);
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue(['not-video-file.txt']);

      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO EXTRACTION FAILED');
  });

  it('should catch unhandled errors from execYtDlp with message', async () => {
      vi.mocked(execYtDlp).mockRejectedValue(new Error('Process failed'));
      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO DOWNLOAD FAILED');
  });

  it('should catch unhandled errors from execYtDlp with stderr', async () => {
      vi.mocked(execYtDlp).mockRejectedValue({ stderr: 'Process failed via stderr' });
      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO DOWNLOAD FAILED');
  });

  it('should catch generic string errors from execYtDlp', async () => {
      vi.mocked(execYtDlp).mockRejectedValue('Generic error');
      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO DOWNLOAD FAILED');
  });

  it('should catch generic object without stderr or message', async () => {
      vi.mocked(execYtDlp).mockRejectedValue({ somethingElse: 123 });
      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO DOWNLOAD FAILED');
  });

  it('should catch falsy error objects gracefully', async () => {
      vi.mocked(execYtDlp).mockRejectedValue(null);
      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO DOWNLOAD FAILED');
  });

  it('should trigger branch coverage for err.message fallback', async () => {
      vi.mocked(execYtDlp).mockRejectedValue({ message: 'Process failed via message' });
      await expect(downloadAudioOnly(mockVideo, mockConfig))
        .rejects.toThrow('AUDIO DOWNLOAD FAILED');
  });
});
