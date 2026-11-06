import { describe, expect, it } from 'vitest';
import { IMAGE_FORMATS, IMAGE_MAX_DIMENSIONS, isImageFormat } from './options';

describe('image conversion options', () => {
  it('offers JPG and PNG output', () => {
    expect(IMAGE_FORMATS.map((format) => format.value)).toEqual(['jpeg', 'png']);
  });

  it('mirrors the Go size presets including original', () => {
    expect(IMAGE_MAX_DIMENSIONS.map((choice) => choice.value)).toEqual([0, 2000, 1400, 1000]);
  });

  it('validates format identifiers', () => {
    expect(isImageFormat('jpeg')).toBe(true);
    expect(isImageFormat('png')).toBe(true);
    expect(isImageFormat('webp')).toBe(false);
    expect(isImageFormat('')).toBe(false);
  });
});
