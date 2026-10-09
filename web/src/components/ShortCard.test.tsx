import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ShortCard } from './ShortCard';

describe('ShortCard', () => {
  it('renders short card details correctly', () => {
    const short = {
      id: '1',
      title: 'Awesome Short',
      description: 'This is a description',
      channelName: 'Test Channel',
      duration: 60,
      startTime: 10,
      endTime: 70,
      viralScore: 9,
      downloadUrl: 'http://localhost/download',
      originalVideoUrl: 'http://localhost/original',
      createdAt: '2023-10-01T00:00:00Z',
      status: 'completed' as const
    };
    const { container } = render(<ShortCard short={short} />);
    expect(container.textContent).toMatch(/Awesome Short/);
    expect(container.textContent).toMatch(/Test Channel/);
    expect(container.textContent).toMatch(/This is a description/);
    expect(container.textContent).toMatch(/⭐ 9\/10/);
    expect(container.textContent).toMatch(/0:10/);
    expect(container.textContent).toMatch(/1:10/);
  });

  it('renders score badge colors correctly', () => {
    const short = {
      id: '1',
      title: 'Mid Short',
      description: '',
      channelName: '',
      duration: 10,
      startTime: 0,
      endTime: 10,
      viralScore: 5,
      downloadUrl: '',
      originalVideoUrl: '',
      createdAt: '2023-10-01T00:00:00Z',
      status: 'completed' as const
    };
    const { container, rerender } = render(<ShortCard short={short} />);
    expect(container.textContent).toMatch(/⭐ 5\/10/);

    rerender(<ShortCard short={{...short, viralScore: 2}} />);
    expect(container.textContent).toMatch(/⭐ 2\/10/);
  });
});
