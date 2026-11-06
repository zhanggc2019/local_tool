import { describe, expect, it } from 'vitest';
import { maskAlpha } from './person-segmenter';

describe('segmentation mask alpha curve', () => {
  it('maps low confidence to transparent and high confidence to opaque', () => {
    expect(maskAlpha(0)).toBe(0);
    expect(maskAlpha(0.1)).toBe(0);
    expect(maskAlpha(1)).toBe(255);
  });

  it('ramps smoothly between the cutoffs', () => {
    // The curve is a smoothstep from 0.12 to 0.84 confidence.
    expect(maskAlpha(0.12)).toBe(0);
    expect(maskAlpha(0.84)).toBe(255);
    const middle = maskAlpha(0.48);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(255);
    // Monotonic across the ramp.
    let previous = -1;
    for (let step = 0; step <= 20; step++) {
      const alpha = maskAlpha(0.12 + (0.72 * step) / 20);
      expect(alpha).toBeGreaterThanOrEqual(previous);
      previous = alpha;
    }
  });

  it('clamps out-of-range confidence', () => {
    expect(maskAlpha(-5)).toBe(0);
    expect(maskAlpha(5)).toBe(255);
    expect(maskAlpha(Number.NaN)).toBe(0);
  });
});
