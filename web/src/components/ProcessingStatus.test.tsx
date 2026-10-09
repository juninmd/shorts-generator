import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ProcessingStatus } from './ProcessingStatus';
import type { JobStatus } from '../types';

describe('ProcessingStatus', () => {
  it('returns null if no progress', () => {
    const { container } = render(<ProcessingStatus job={{ jobId: '1', status: 'queued' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders progress correctly', () => {
    const job: JobStatus = {
      jobId: '1',
      status: 'processing',
      progress: {
        stage: 'downloading',
        progress: 50,
        message: 'Downloading stuff',
        videoTitle: 'Test Video',
        currentShort: 1,
        totalShorts: 5
      }
    };
    const { container } = render(<ProcessingStatus job={job} />);
    expect(container.textContent).toMatch(/📥 Baixando vídeo/);
    expect(container.textContent).toMatch(/Downloading stuff/);
    expect(container.textContent).toMatch(/🎥 Test Video/);
    expect(container.textContent).toMatch(/✂️ Short 1 de 5/);
    expect(container.textContent).toMatch(/50%/);
  });

  it('renders completed state correctly', () => {
    const job: JobStatus = {
      jobId: '1',
      status: 'completed',
      results: [{ videoId: '1', videoUrl: 'v1', shorts: [{ id: 's1', title: 'T1' } as any] }],
      progress: { stage: 'done', progress: 100, message: 'Done' }
    };
    const { container } = render(<ProcessingStatus job={job} />);
    expect(container.textContent).toMatch(/✅ Processamento concluído! 1 shorts gerados./);
  });

  it('renders error state correctly', () => {
    const job: JobStatus = {
      jobId: '1',
      status: 'failed',
      progress: { stage: 'error', progress: 0, message: 'Bad error' }
    };
    const { container } = render(<ProcessingStatus job={job} />);
    expect(container.textContent).toMatch(/❌ Falha no processamento: Bad error/);
  });

  it('handles unknown stages safely', () => {
    const job: JobStatus = {
      jobId: '1',
      status: 'processing',
      progress: { stage: 'unknown-stage', progress: 10, message: 'Wait' }
    };
    const { container } = render(<ProcessingStatus job={job} />);
    expect(container.textContent).toMatch(/unknown-stage/);
  });
});
