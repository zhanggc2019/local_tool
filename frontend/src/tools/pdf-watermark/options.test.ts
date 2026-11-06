import { describe, expect, it } from 'vitest';
import { WATERMARK_COLORS, clampInt, describeWatermark } from './options';

describe('PDF watermark options', () => {
  it('offers four distinct color presets', () => {
    expect(WATERMARK_COLORS).toHaveLength(4);
    expect(new Set(WATERMARK_COLORS.map((color) => color.value)).size).toBe(4);
    for (const color of WATERMARK_COLORS) expect(color.value).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('clamps slider values into range', () => {
    expect(clampInt(36, 12, 96)).toBe(36);
    expect(clampInt(3, 12, 96)).toBe(12);
    expect(clampInt(500, 12, 96)).toBe(96);
    expect(clampInt(Number.NaN, 5, 100)).toBe(5);
    expect(clampInt(30.6, 5, 100)).toBe(31);
  });

  it('describes the appearance and rejects empty text', () => {
    expect(describeWatermark('内部资料', 36, 30, 45)).toBe('“内部资料” · 36 pt · 30% 不透明 · 45°');
    expect(describeWatermark('   ', 36, 30, 45)).toBe('请输入水印文字');
  });
});
