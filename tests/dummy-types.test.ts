import { describe, it, expect } from 'vitest';
import type { VideoInfo, PipelineConfig } from '../src/types.js';

describe('Dummy Type Tests', () => {
  it('should test VideoInfo nullability', () => {
    const dummy: VideoInfo | null = null;
    expect(dummy).toBeNull();
  });

  it('should test PipelineConfig nullability', () => {
    const dummy: PipelineConfig | null = null;
    expect(dummy).toBeNull();
  });
});
