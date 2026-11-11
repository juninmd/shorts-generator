import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CutsWorkspace } from './CutsWorkspace';
import * as api from '../api';

vi.mock('../api', () => ({
  listCuts: vi.fn(),
  createCut: vi.fn(),
  deleteCut: vi.fn(),
}));

const cut = { id: 'c1', channelId: 'ch', sourceVideoId: 'vid', title: 'Perdão', startSec: 10, endSec: 40, createdAt: 'x' };

describe('CutsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCuts).mockResolvedValue([cut]);
    vi.mocked(api.createCut).mockResolvedValue({ id: 'new' });
    vi.mocked(api.deleteCut).mockResolvedValue(undefined);
  });

  it('asks for a channel and token when missing', () => {
    render(<CutsWorkspace adminToken="" channelId="" />);
    expect(screen.getByText(/Escolha um canal e informe o token/)).toBeTruthy();
  });

  it('lists cuts, previews one and deletes one', async () => {
    render(<CutsWorkspace adminToken="t" channelId="ch" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Perdão' }));
    expect(screen.getByTestId('short-preview').textContent).toContain('Perdão');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Perdão' }));
    await waitFor(() => expect(api.deleteCut).toHaveBeenCalledWith('t', 'ch', 'c1'));
  });

  it('shows the empty state when there are no cuts', async () => {
    vi.mocked(api.listCuts).mockResolvedValueOnce([]);
    render(<CutsWorkspace adminToken="t" channelId="ch" />);
    expect(await screen.findByText('Nenhum corte manual ainda.')).toBeTruthy();
  });

  it('saves a new cut and clears the title', async () => {
    render(<CutsWorkspace adminToken="t" channelId="ch" />);
    fireEvent.change(screen.getByLabelText('ID do vídeo'), { target: { value: 'vid123' } });
    fireEvent.change(screen.getByLabelText('Título do corte'), { target: { value: 'Novo' } });
    fireEvent.change(screen.getByLabelText('Início (s)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Fim (s)'), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar corte' }));
    await waitFor(() => expect(api.createCut).toHaveBeenCalledWith('t', 'ch', { sourceVideoId: 'vid123', title: 'Novo', startSec: 5, endSec: 35 }));
    await waitFor(() => expect((screen.getByLabelText('Título do corte') as HTMLInputElement).value).toBe(''));
  });

  it('shows a form error when saving fails', async () => {
    vi.mocked(api.createCut).mockRejectedValueOnce(new Error('Duração inválida'));
    render(<CutsWorkspace adminToken="t" channelId="ch" />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar corte' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Duração inválida');
  });

  it('shows the list error when loading fails', async () => {
    vi.mocked(api.listCuts).mockRejectedValueOnce('falhou');
    render(<CutsWorkspace adminToken="t" channelId="ch" />);
    expect((await screen.findByRole('alert')).textContent).toContain('falhou');
  });
});
