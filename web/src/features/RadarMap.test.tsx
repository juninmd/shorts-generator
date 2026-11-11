import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RadarMap } from './RadarMap';

const suggestion = { startSec: 10, endSec: 50, title: 'O perdão', viralScore: 91, reason: 'Pausa antes do pico', scoreBreakdown: { hook: 1, flow: 2, engagement: 3, trend: 4 } };
const second = { ...suggestion, startSec: 300, endSec: 340, title: 'Dívida', viralScore: 80 };
const analysis = {
  energy: [0.2, 0.9, 0.4],
  replay: [1, 3, 2],
  speakerLanes: [{ startSec: 0, endSec: 90, speaker: 1 }, { startSec: 90, endSec: 180, speaker: 2 }],
  suggestions: [suggestion, second],
};

describe('RadarMap', () => {
  it('renders the map, the selected suggestion and approves it', () => {
    const onApprove = vi.fn();
    render(<RadarMap durationSec={2538} analysis={analysis} onApprove={onApprove} />);
    expect(screen.getByRole('img', { name: 'Mapa do vídeo-fonte' })).toBeTruthy();
    expect(screen.getByText('Pausa antes do pico')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar corte' }));
    expect(onApprove).toHaveBeenCalledWith(suggestion);
  });

  it('selects a suggestion by click and by Enter key, ignoring other keys', () => {
    render(<RadarMap durationSec={2538} analysis={analysis} onApprove={vi.fn()} />);
    const band = screen.getByRole('button', { name: 'Corte Dívida' });
    fireEvent.keyDown(band, { key: 'a' });
    expect(screen.getByText('Pausa antes do pico')).toBeTruthy();
    fireEvent.keyDown(band, { key: 'Enter' });
    expect(screen.getByRole('heading', { name: 'Dívida' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Corte O perdão' }));
    expect(screen.getByRole('heading', { name: 'O perdão' })).toBeTruthy();
  });

  it('handles no replay data and no suggestions', () => {
    const { container } = render(<RadarMap durationSec={100} analysis={{ energy: [], replay: [], speakerLanes: [], suggestions: [] }} onApprove={vi.fn()} />);
    expect(container.querySelector('rect')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprovar corte' })).toBeNull();
  });
});
