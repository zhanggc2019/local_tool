import { describe, expect, it } from 'vitest';
import { CUTOUT_BACKGROUNDS, effectiveFormat, isCutoutBackground } from './processor';

describe('cutout background choices', () => {
  it('defines transparent plus solid presets with fills', () => {
    expect(CUTOUT_BACKGROUNDS.transparent.fill).toBeNull();
    for (const key of ['white', 'blue', 'red', 'green'] as const) {
      expect(CUTOUT_BACKGROUNDS[key].fill).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('validates background identifiers', () => {
    expect(isCutoutBackground('transparent')).toBe(true);
    expect(isCutoutBackground('white')).toBe(true);
    expect(isCutoutBackground('purple')).toBe(false);
    expect(isCutoutBackground('')).toBe(false);
    expect(isCutoutBackground('constructor')).toBe(false);
  });

  it('forces PNG for transparency and honors the requested format otherwise', () => {
    expect(effectiveFormat('transparent', 'jpeg')).toBe('png');
    expect(effectiveFormat('transparent', 'png')).toBe('png');
    expect(effectiveFormat('white', 'jpeg')).toBe('jpeg');
    expect(effectiveFormat('blue', 'png')).toBe('png');
  });
});
