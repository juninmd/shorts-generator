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
