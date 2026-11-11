import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToolPage } from './ToolPage';

vi.mock('./ChannelWizard', () => ({ ChannelWizard: () => 'wizard-view' }));
vi.mock('./CutsWorkspace', () => ({ CutsWorkspace: () => 'cuts-view' }));
vi.mock('./ScheduleBoard', () => ({ ScheduleBoard: () => 'schedule-view' }));
vi.mock('./RadarPanel', () => ({ RadarPanel: () => 'radar-view' }));
vi.mock('../hooks/useChannelTools', () => ({ useCuts: () => ({ cuts: [], error: null, add: vi.fn(), remove: vi.fn() }) }));

describe('ToolPage', () => {
  it('switches between tools and goes back', () => {
    const onBack = vi.fn();
    render(<ToolPage adminToken="t" channelId="ch" onBack={onBack} onSaveChannel={vi.fn()} />);
    expect(screen.getByText('wizard-view')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Cortes manuais' }));
    expect(screen.getByText('cuts-view')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Agenda' }));
    expect(screen.getByText('schedule-view')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Radar' }));
    expect(screen.getByText('radar-view')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Console' }));
    expect(onBack).toHaveBeenCalled();
  });
});
