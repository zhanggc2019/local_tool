import { describe, expect, it } from 'vitest';
import { SPEED_RATES, isSpeedRate, rateLabel } from './options';

describe('playback rate options', () => {
  it('mirrors the Go rate list', () => {
    expect([...SPEED_RATES]).toEqual([0.5, 0.75, 1.25, 1.5, 2, 3, 4]);
  });

  it('formats labels without trailing zeros', () => {
    expect(rateLabel(2)).toBe('2×');
    expect(rateLabel(0.5)).toBe('0.5×');
    expect(rateLabel(0.75)).toBe('0.75×');
    expect(rateLabel(1.25)).toBe('1.25×');
  });

  it('validates rates', () => {
    expect(isSpeedRate(2)).toBe(true);
    expect(isSpeedRate(1)).toBe(false);
    expect(isSpeedRate(5)).toBe(false);
    expect(isSpeedRate(Number.NaN)).toBe(false);
  });
});
