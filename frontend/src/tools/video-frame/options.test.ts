import { describe, expect, it } from 'vitest';
import { FRAME_COUNTS, FRAME_MODES, isFrameMode } from './options';

describe('frame capture options', () => {
  it('mirrors the Go frame counts', () => {
    expect([...FRAME_COUNTS]).toEqual([4, 6, 9, 12]);
  });

  it('offers single and spread modes', () => {
    expect(FRAME_MODES.map((mode) => mode.value)).toEqual(['single', 'spread']);
    for (const mode of FRAME_MODES) {
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.hint.length).toBeGreaterThan(0);
    }
  });

  it('validates mode identifiers', () => {
    expect(isFrameMode('single')).toBe(true);
    expect(isFrameMode('spread')).toBe(true);
    expect(isFrameMode('tile')).toBe(false);
    expect(isFrameMode('')).toBe(false);
  });
});
