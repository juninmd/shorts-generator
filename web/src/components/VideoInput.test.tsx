import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoInput } from './VideoInput';

describe('VideoInput', () => {
  it('renders correctly and handles input', () => {
    const onSubmit = vi.fn();
    render(<VideoInput onSubmit={onSubmit} isLoading={false} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'https://youtube.com/v1\nhttps://youtube.com/v2' } });

    expect(screen.getByText('2 URL(s) detectada(s)')).toBeInTheDocument();

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onSubmit).toHaveBeenCalledWith(['https://youtube.com/v1', 'https://youtube.com/v2']);
  });

  it('renders loading state', () => {
    const { container } = render(<VideoInput onSubmit={vi.fn()} isLoading={true} />);
    const button = container.querySelector('button');
    expect(button).toBeDisabled();
    expect(container.textContent).toMatch(/Processando/);
  });
});
