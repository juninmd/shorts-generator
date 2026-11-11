import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { useAdminConsole } from './hooks/useAdminConsole';

vi.mock('./hooks/useAdminConsole', () => ({ useAdminConsole: vi.fn() }));
vi.mock('./api', () => ({
  listCuts: vi.fn().mockResolvedValue([]),
  listSchedule: vi.fn().mockResolvedValue([]),
}));

const hook = (overrides: Record<string, unknown> = {}) => ({
  adminToken: 't',
  setAdminToken: vi.fn(),
  channels: [],
  runs: [],
  selectedChannelId: '',
  setSelectedChannelId: vi.fn(),
  error: null,
  isPending: false,
  save: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn(),
  test: vi.fn(),
  run: vi.fn(),
  refreshNow: vi.fn(),
  ...overrides,
});

describe('App tools entry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the tools page and saves a channel created in the wizard', async () => {
    const h = hook();
    vi.mocked(useAdminConsole).mockReturnValue(h as never);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Cortes, agenda e Radar/ }));
    expect(screen.getByRole('tab', { name: 'Criar canal' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar →' }));
    fireEvent.change(screen.getByLabelText('Nome do canal'), { target: { value: 'Canal Novo' } });
    fireEvent.change(screen.getByLabelText('ID único'), { target: { value: 'canal-novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar →' }));
    fireEvent.change(screen.getByLabelText('Fontes de vídeo'), { target: { value: 'youtube_handle|A|@a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar canal' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ channel: expect.objectContaining({ id: 'canal-novo' }) })));
  });

  it('returns to the console from the tools page', () => {
    vi.mocked(useAdminConsole).mockReturnValue(hook() as never);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Cortes, agenda e Radar/ }));
    fireEvent.click(screen.getByRole('button', { name: '← Console' }));
    expect(screen.getByRole('button', { name: /Cortes, agenda e Radar/ })).toBeTruthy();
  });
});
