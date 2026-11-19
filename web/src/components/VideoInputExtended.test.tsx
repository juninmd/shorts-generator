import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoInput } from './VideoInput';

describe('VideoInput extended', () => {
  it('does not submit if no valid urls', () => {
    const onSubmit = vi.fn();
    render(<VideoInput onSubmit={onSubmit} isLoading={false} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'invalid-url' } });

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('VideoInput validation', () => {
  it('tells the user when nothing valid was pasted instead of failing silently', () => {
    render(<VideoInput onSubmit={vi.fn()} isLoading={false} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'httpfoo' } });
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('alert')).toHaveTextContent(/nenhuma url válida/i);
  });

  it('submits each URL once and ignores lookalikes such as "httpfoo"', () => {
    const onSubmit = vi.fn();
    render(<VideoInput onSubmit={onSubmit} isLoading={false} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'https://youtube.com/v1, httpfoo\nhttps://youtube.com/v1\nhttp://a.test/2' },
    });
    expect(screen.getByText('2 URL(s) detectada(s)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onSubmit).toHaveBeenCalledWith(['https://youtube.com/v1', 'http://a.test/2']);
  });

  it('exposes an accessible name for the textarea', () => {
    render(<VideoInput onSubmit={vi.fn()} isLoading={false} />);
    expect(screen.getByRole('textbox', { name: /urls dos vídeos/i })).toBeInTheDocument();
  });
});
