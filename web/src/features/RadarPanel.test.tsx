import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RadarPanel } from './RadarPanel';
import * as api from '../api';

vi.mock('../api', () => ({
  getSourceAnalysis: vi.fn(),
  createCut: vi.fn(),
}));

const analysis = {
  channelId: 'ch',
  sourceVideoId: 'vid123',
  durationSec: 600,
  createdAt: 'x',
  analysis: {
    energy: [0.5, 0.6],
    replay: [1],
    speakerLanes: [],
    suggestions: [{ startSec: 10, endSec: 40, title: 'Trecho', viralScore: 77, reason: 'Forte', scoreBreakdown: { hook: 1, flow: 1, engagement: 1, trend: 1 } }],
  },
};

describe('RadarPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getSourceAnalysis).mockResolvedValue(analysis);
    vi.mocked(api.createCut).mockResolvedValue({ id: 'n' });
  });

  it('asks for a channel and token when missing', () => {
    render(<RadarPanel adminToken="" channelId="" />);
    expect(screen.getByText(/para usar o Radar/)).toBeTruthy();
  });

  it('asks for a video id before loading', () => {
    render(<RadarPanel adminToken="t" channelId="ch" />);
    expect(screen.getByText(/ID de um vídeo já analisado/)).toBeTruthy();
  });

  it('shows the map and saves an approved suggestion as a manual cut', async () => {
    render(<RadarPanel adminToken="t" channelId="ch" />);
    fireEvent.change(screen.getByLabelText('ID do vídeo-fonte'), { target: { value: ' vid123 ' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar corte' }));
    await waitFor(() => expect(api.createCut).toHaveBeenCalledWith('t', 'ch', { sourceVideoId: 'vid123', title: 'Trecho', startSec: 10, endSec: 40 }));
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('shows the error when no analysis exists yet', async () => {
    vi.mocked(api.getSourceAnalysis).mockRejectedValueOnce(new Error('Analysis not found'));
    render(<RadarPanel adminToken="t" channelId="ch" />);
    fireEvent.change(screen.getByLabelText('ID do vídeo-fonte'), { target: { value: 'vid999' } });
    expect((await screen.findByRole('alert')).textContent).toContain('Ainda não há análise');
  });

  it('shows the save error when approving fails', async () => {
    vi.mocked(api.createCut).mockRejectedValueOnce(new Error('Duração inválida'));
    render(<RadarPanel adminToken="t" channelId="ch" />);
    fireEvent.change(screen.getByLabelText('ID do vídeo-fonte'), { target: { value: 'vid123' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar corte' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Duração inválida');
  });
});
