import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Layout } from './Layout';

describe('Layout', () => {
  it('renders children and branding', () => {
    const { container } = render(<Layout><div id='test-child'>Child</div></Layout>);
    expect(container.querySelector('#test-child')).not.toBeNull();
    expect(container.textContent).toMatch(/Shorts Generator/);
    expect(container.textContent).toMatch(/AI-powered viral clip/);
  });
});
