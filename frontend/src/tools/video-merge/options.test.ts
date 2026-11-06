import { describe, expect, it } from 'vitest';
import { MERGE_MODES, isMergeMode } from './options';

describe('video merge modes', () => {
  it('offers fast and precise strategies', () => {
    expect(MERGE_MODES.map((mode) => mode.value)).toEqual(['fast', 'precise']);
    for (const mode of MERGE_MODES) expect(mode.hint.length).toBeGreaterThan(0);
  });

  it('validates mode identifiers', () => {
    expect(isMergeMode('fast')).toBe(true);
    expect(isMergeMode('precise')).toBe(true);
    expect(isMergeMode('copy')).toBe(false);
    expect(isMergeMode('')).toBe(false);
  });
});
