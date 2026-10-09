import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WindowLeaderboard } from './WindowLeaderboard';

describe('WindowLeaderboard extended', () => {
  it('handles null median and empty lists', () => {
    const group = {
      key: '1',
      window: '24h',
      sampleSize: 10,
      immature: 0,
      medianViews: null,
      top: [],
      flop: []
    };
    const { container } = render(<WindowLeaderboard group={group} />);
    expect(container.textContent).toMatch(/—/);
    expect(container.textContent).not.toMatch(/🔥 Top/);
    expect(container.textContent).not.toMatch(/📉 Abaixo da mediana/);
  });
});
