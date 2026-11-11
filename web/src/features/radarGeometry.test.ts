import { describe, it, expect } from 'vitest';
import { bandGeometry, energyPath, formatTime, xAt } from './radarGeometry';

describe('radarGeometry', () => {
  it('builds an empty path for no energy samples', () => {
    expect(energyPath([])).toBe('');
  });

  it('builds a closed path and clamps values outside 0-1', () => {
    const d = energyPath([2, -1]);
    expect(d.startsWith('M0.0 18.0 L1000.0 118.0')).toBe(true);
    expect(d.endsWith('L1000 130 L0 130Z')).toBe(true);
  });

  it('handles a single sample without dividing by zero', () => {
    expect(energyPath([0.5])).toContain('M0.0 68.0');
  });

  it('maps seconds to x and guards zero duration', () => {
    expect(xAt(50, 100)).toBe(500);
    expect(xAt(10, 0)).toBe(0);
  });

  it('keeps bands at least 2px wide', () => {
    expect(bandGeometry(10, 10, 100).width).toBe(2);
    expect(bandGeometry(10, 20, 100).width).toBe(100);
  });

  it('formats mm:ss', () => {
    expect(formatTime(2538)).toBe('42:18');
    expect(formatTime(5)).toBe('0:05');
  });
});
