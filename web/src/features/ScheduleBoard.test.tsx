import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScheduleBoard, dayKey, groupByDay } from './ScheduleBoard';
import * as api from '../api';

vi.mock('../api', () => ({
  listSchedule: vi.fn(),
  createScheduleEntry: vi.fn(),
  deleteScheduleEntry: vi.fn(),
}));

const cuts = [{ id: 'c1', channelId: 'ch', sourceVideoId: 'v', title: 'Corte A', startSec: 0, endSec: 20, createdAt: 'x' }];

describe('ScheduleBoard helpers', () => {
  it('groups entries into the seven-day window and drops entries outside it', () => {
    const start = new Date(2026, 10, 11, 9, 0);
    const inside = { id: 'e1', channelId: 'ch', cutId: null, kind: 'programmed' as const, runAt: new Date(2026, 10, 13, 9).toISOString(), createdAt: 'x' };
    const outside = { ...inside, id: 'e2', runAt: new Date(2026, 9, 1, 9).toISOString() };
    const grouped = groupByDay([inside, outside], start);
    expect(Object.keys(grouped)).toHaveLength(7);
    expect(grouped[dayKey(new Date(2026, 10, 13))]).toEqual([inside]);
    expect(Object.values(grouped).flat()).not.toContain(outside);
  });
});

describe('ScheduleBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listSchedule).mockResolvedValue([]);
    vi.mocked(api.createScheduleEntry).mockResolvedValue({ id: 'n' });
    vi.mocked(api.deleteScheduleEntry).mockResolvedValue(undefined);
  });

  it('asks for a channel and token when missing', () => {
    render(<ScheduleBoard adminToken="" channelId="" cuts={[]} />);
    expect(screen.getByText(/para ver a agenda/)).toBeTruthy();
  });

  it('schedules a programmed run without a cut', async () => {
    render(<ScheduleBoard adminToken="t" channelId="ch" cuts={cuts} />);
    fireEvent.change(screen.getByLabelText('Quando'), { target: { value: '2026-11-12T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
    await waitFor(() => expect(api.createScheduleEntry).toHaveBeenCalledWith('t', 'ch', { runAt: new Date('2026-11-12T09:00').toISOString(), kind: 'programmed', cutId: null }));
  });

  it('schedules a manual cut and requires the cut to be chosen', async () => {
    render(<ScheduleBoard adminToken="t" channelId="ch" cuts={cuts} />);
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'manual' } });
    expect((screen.getByLabelText('Corte') as HTMLSelectElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Corte'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Quando'), { target: { value: '2026-11-12T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
    await waitFor(() => expect(api.createScheduleEntry).toHaveBeenCalledWith('t', 'ch', expect.objectContaining({ kind: 'manual', cutId: 'c1' })));
  });

  it('shows the server message when scheduling fails', async () => {
    vi.mocked(api.createScheduleEntry).mockRejectedValueOnce(new Error('Agendamento manual precisa de um corte'));
    render(<ScheduleBoard adminToken="t" channelId="ch" cuts={cuts} />);
    fireEvent.change(screen.getByLabelText('Quando'), { target: { value: '2026-11-12T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('precisa de um corte');
  });

  it('renders entries on their day and removes one', async () => {
    const soon = new Date();
    soon.setHours(12, 0, 0, 0);
    vi.mocked(api.listSchedule).mockResolvedValueOnce([
      { id: 'e1', channelId: 'ch', cutId: 'c1', kind: 'manual', runAt: soon.toISOString(), createdAt: 'x' },
      { id: 'e2', channelId: 'ch', cutId: null, kind: 'programmed', runAt: soon.toISOString(), createdAt: 'x' },
    ]);
    render(<ScheduleBoard adminToken="t" channelId="ch" cuts={cuts} />);
    expect(await screen.findByText(/auto/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover agendamento' })[0]);
    await waitFor(() => expect(api.deleteScheduleEntry).toHaveBeenCalledWith('t', 'ch', 'e1'));
  });

  it('shows the list error when loading fails', async () => {
    vi.mocked(api.listSchedule).mockRejectedValueOnce(new Error('offline'));
    render(<ScheduleBoard adminToken="t" channelId="ch" cuts={[]} />);
    expect((await screen.findByRole('alert')).textContent).toContain('offline');
  });
});
