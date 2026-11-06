import { describe, expect, it } from 'vitest';
import { GIF_FPS, GIF_WIDTHS, formatGIFSize } from './options';

describe('GIF export options', () => {
  it('mirrors the Go width and fps choices', () => {
    expect(GIF_WIDTHS.map((choice) => choice.value)).toEqual([320, 480, 640]);
    expect(GIF_FPS.map((choice) => choice.value)).toEqual([10, 15, 24]);
  });

  it('defaults to the middle choices', () => {
    expect(GIF_WIDTHS[1].value).toBe(480);
    expect(GIF_FPS[1].value).toBe(15);
  });

  it('formats GIF sizes for the result panel', () => {
    expect(formatGIFSize(0)).toBe('—');
    expect(formatGIFSize(-1)).toBe('—');
    expect(formatGIFSize(Number.NaN)).toBe('—');
    expect(formatGIFSize(400 * 1024)).toBe('400 KB');
    expect(formatGIFSize(2.6 * 1024 * 1024)).toBe('2.6 MB');
  });
});
