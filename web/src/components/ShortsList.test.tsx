import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ShortsList } from './ShortsList';
import type { ShortItem } from '../types';

describe('ShortsList', () => {
  it('renders empty state when list is empty', () => {
    const { container } = render(<ShortsList shorts={[]} />);
    expect(container.textContent).toMatch(/Nenhum short gerado/);
  });

  it('renders a list of sorted shorts', () => {
    const shorts: ShortItem[] = [
      {
        id: '1',
        title: 'Short 1',
        description: 'D1',
        channelName: 'C1',
        duration: 10,
        startTime: 0,
        endTime: 10,
        viralScore: 5,
        downloadUrl: 'url1',
        originalVideoUrl: 'ourl1',
        createdAt: '2023-10-01',
        status: 'completed'
      },
      {
        id: '2',
        title: 'Short 2',
        description: 'D2',
        channelName: 'C2',
        duration: 10,
        startTime: 0,
        endTime: 10,
        viralScore: 10,
        downloadUrl: 'url2',
        originalVideoUrl: 'ourl2',
        createdAt: '2023-10-01',
        status: 'completed'
      }
    ];

    const { container } = render(<ShortsList shorts={shorts} />);
    expect(container.textContent).toMatch(/Shorts Gerados \(2\)/);

    const titles = Array.from(container.querySelectorAll('h3')).map(h3 => h3.textContent);
    expect(titles[0]).toBe('Short 2'); // Sorted by viral score desc
    expect(titles[1]).toBe('Short 1');
  });
});
