import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChannelWizard } from './ChannelWizard';
import { createDraft, validateStep } from './wizardDraft';
import { StepReview, StepSources } from './wizardSteps';

const goNext = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar →' }));

describe('wizardDraft', () => {
  it('validates each step', () => {
    const d = createDraft();
    expect(validateStep(d, 0)).toBeNull();
    expect(validateStep(d, 1)).toBe('Dê um nome ao canal.');
    d.channel.name = 'Canal';
    expect(validateStep(d, 1)).toMatch(/ID/);
    d.channel.id = 'canal-01';
    expect(validateStep(d, 1)).toBeNull();
    expect(validateStep(d, 2)).toMatch(/fonte/);
    d.channel.channelType = 'quiz';
    expect(validateStep(d, 2)).toBeNull();
    d.profile.minShortDuration = 60;
    expect(validateStep(d, 3)).toMatch(/mínima/);
    expect(validateStep(d, 4)).toBeNull();
  });
});

describe('ChannelWizard', () => {
  it('blocks moving on until the identity is valid, then saves and resets', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ChannelWizard onSave={onSave} />);
    goNext();
    goNext();
    expect(screen.getByRole('alert').textContent).toContain('Dê um nome');
    fireEvent.change(screen.getByLabelText('Nome do canal'), { target: { value: 'Canal X' } });
    fireEvent.change(screen.getByLabelText('ID único'), { target: { value: 'CANAL-X' } });
    fireEvent.change(screen.getByLabelText("Marca d'água"), { target: { value: '@x' } });
    expect((screen.getByLabelText('ID único') as HTMLInputElement).value).toBe('canal-x');
    goNext();
    fireEvent.change(screen.getByLabelText('Fontes de vídeo'), { target: { value: 'youtube_handle|Frei|@frei' } });
    goNext();
    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Criar canal' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ channel: expect.objectContaining({ id: 'canal-x', name: 'Canal X', watermarkText: '@x' }) })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar →' })).toBeTruthy());
  });

  it('goes back, switches type and shows save errors', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Canal já existe'));
    render(<ChannelWizard onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Quiz/ }));
    expect(screen.getByRole('button', { name: /Quiz/ }).getAttribute('aria-pressed')).toBe('true');
    goNext();
    fireEvent.click(screen.getByRole('button', { name: '← Voltar' }));
    goNext();
    expect(screen.getByLabelText('Nome do canal')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nome do canal'), { target: { value: 'Quiz X' } });
    fireEvent.change(screen.getByLabelText('ID único'), { target: { value: 'quiz-x' } });
    goNext();
    goNext();
    goNext();
    fireEvent.click(screen.getByRole('button', { name: 'Criar canal' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Canal já existe');
  });

  it('updates numeric rules and checks the duration range', () => {
    render(<ChannelWizard onSave={vi.fn()} />);
    goNext();
    fireEvent.change(screen.getByLabelText('Nome do canal'), { target: { value: 'C' } });
    fireEvent.change(screen.getByLabelText('ID único'), { target: { value: 'canal-c' } });
    goNext();
    goNext();
    fireEvent.change(screen.getByLabelText('Fontes de vídeo'), { target: { value: 'youtube_handle|A|@a' } });
    goNext();
    fireEvent.change(screen.getByLabelText('Duração mín (s)'), { target: { value: '70' } });
    goNext();
    expect(screen.getByRole('alert').textContent).toContain('mínima');
  });
});

describe('wizard steps', () => {
  it('explains that quiz channels have no sources and reviews the draft', () => {
    const quiz = createDraft();
    quiz.channel.channelType = 'quiz';
    const { getByText, rerender } = render(<StepSources draft={quiz} update={vi.fn()} />);
    expect(getByText(/Quiz não usa fontes/)).toBeTruthy();
    rerender(<StepReview draft={quiz} />);
    expect(getByText('Quiz')).toBeTruthy();
    expect(getByText('—')).toBeTruthy();
  });
});
