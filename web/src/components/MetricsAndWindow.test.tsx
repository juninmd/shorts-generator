import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MetricsSparkline } from './MetricsSparkline';
import { WindowLeaderboard } from './WindowLeaderboard';

describe('MetricsSparkline', () => {
  it('renders an empty state when no series is provided', () => {
    const { container } = render(<MetricsSparkline series={[]} />);
    expect(container.textContent).toMatch(/Ainda sem snapshots suficientes/);
  });

  it('renders an SVG graph when series is provided', () => {
    const series = [
      { day: '2023-10-01', totalViews: 100, videoCount: 1, avgViewPercentage: 10 },
      { day: '2023-10-02', totalViews: 200, videoCount: 2, avgViewPercentage: 20 }
    ];
    const { container } = render(<MetricsSparkline series={series} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });
});

describe('WindowLeaderboard', () => {
  it('renders correctly', () => {
    const group = {
      key: '1',
      window: '24h',
      sampleSize: 10,
      immature: 2,
      medianViews: 500,
      top: [{ youtubeVideoId: '1', title: 'Top Video', views: 1000 }],
      flop: [{ youtubeVideoId: '2', title: 'Flop Video', views: 100 }]
    };
    const { container } = render(<WindowLeaderboard group={group} />);
    expect(container.textContent).toMatch(/Janela 24h/);
    expect(container.textContent).toMatch(/10 vídeos maduros · 2 aguardando/);
    expect(container.textContent).toMatch(/Top Video/);
    expect(container.textContent).toMatch(/Flop Video/);
  });
});
