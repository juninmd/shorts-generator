import { describe, it, expect } from 'vitest';
import { ClipItemSchema, ClipSchema } from '../../src/core/analyzer-schema.js';

describe('analyzer-schema', () => {
  it('should validate a valid clip item', () => {
    const validClip = {
      title: 'Test Title',
      description: 'Test Description',
      contentValue: 'Test Value',
      startTime: 0,
      endTime: 10,
      viralScore: 10,
      reason: 'Because',
      hashtags: ['#test']
    };
    expect(() => ClipItemSchema.parse(validClip)).not.toThrow();
  });

  it('should fail on invalid clip item', () => {
    const invalidClip = {
      title: 'Test Title',
      // missing fields
    };
    expect(() => ClipItemSchema.parse(invalidClip)).toThrow();
  });

  it('should validate a valid clip list', () => {
    const validClipList = {
      clips: [
        {
          title: 'Test Title',
          description: 'Test Description',
          contentValue: 'Test Value',
          startTime: 0,
          endTime: 10,
          viralScore: 10,
          reason: 'Because',
          hashtags: ['#test']
        }
      ]
    };
    expect(() => ClipSchema.parse(validClipList)).not.toThrow();
  });
});
