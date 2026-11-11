import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { ShortPreview } from './ShortPreview';

describe('ShortPreview', () => {
  afterEach(() => vi.useRealTimers());

  it('renders optional overlays only when provided', () => {
    const { getByText, queryByText, container } = render(
      <ShortPreview captions="" hook="Gancho" cta="Siga" watermark="@canal" position="top" accent="#f00" />,
    );
    expect(getByText('Gancho')).toBeTruthy();
    expect(getByText('Siga')).toBeTruthy();
    expect(getByText('@canal')).toBeTruthy();
    expect(container.querySelectorAll('p span')).toHaveLength(0);
    expect(queryByText('nada')).toBeNull();
  });

  it('renders without overlays and with defaults', () => {
    const { getByTestId, container } = render(<ShortPreview captions="uma duas" />);
    expect(getByTestId('short-preview')).toBeTruthy();
    expect(container.querySelectorAll('p span')).toHaveLength(2);
  });

  it('lights up caption words over time and stops at the end', () => {
    vi.useFakeTimers();
    const { container, unmount } = render(<ShortPreview captions="a b" accent="#0f0" />);
    const words = () => Array.from(container.querySelectorAll('p span')) as HTMLElement[];
    expect(words()[0].style.color).toBe('rgb(255, 255, 255)');
    act(() => { vi.advanceTimersByTime(300); });
    expect(words()[0].style.color).not.toBe('rgb(255, 255, 255)');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(words()[1].style.color).not.toBe('rgb(255, 255, 255)');
    unmount();
  });

  it('does not start a timer for empty captions', () => {
    vi.useFakeTimers();
    render(<ShortPreview captions="   " />);
    expect(vi.getTimerCount()).toBe(0);
  });
});
