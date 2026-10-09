import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage extended', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state', () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    render(<DashboardPage adminToken='tok' onBack={vi.fn()} />);
    expect(screen.getByText('Carregando métricas…')).toBeInTheDocument();
  });

  it('renders empty channels state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ generatedAt: '2026-09-10T12:00:00Z', channels: [] })
    }));
    render(<DashboardPage adminToken='tok' onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Nenhum canal ativo com snapshots ainda.')).toBeInTheDocument());
  });

  it('renders channel with windows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        generatedAt: '2026-09-10T12:00:00Z',
        channels: [{
          channelId: 'c1',
          channelName: 'Canal A',
          channelType: 'cuts',
          status: 'active',
          series: [],
          windows: [{
            key: '1',
            window: '24h',
            sampleSize: 10,
            immature: 2,
            medianViews: 500,
            top: [{ youtubeVideoId: '1', title: 'Top', views: 1000 }],
            flop: []
          }]
        }]
      })
    }));
    render(<DashboardPage adminToken='tok' onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Janela 24h')).toBeInTheDocument());
  });
});
