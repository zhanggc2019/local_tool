import { describe, expect, it } from 'vitest';
import { COMPRESS_PRESETS, describeCompression, formatSize } from './presets';

describe('video compression presets', () => {
  it('offers the three size targets with unique ids', () => {
    expect(COMPRESS_PRESETS.map((preset) => preset.id)).toEqual(['half', 'third', 'fifth']);
    expect(new Set(COMPRESS_PRESETS.map((preset) => preset.label)).size).toBe(3);
    for (const preset of COMPRESS_PRESETS) expect(preset.hint.length).toBeGreaterThan(0);
  });

  it('formats sizes in KB, MB, and GB', () => {
    expect(formatSize(0)).toBe('1 KB');
    expect(formatSize(500 * 1024)).toBe('500 KB');
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
    expect(formatSize(2.4 * 1024 * 1024 * 1024)).toBe('2.40 GB');
    expect(formatSize(Number.NaN)).toBe('—');
  });

  it('describes shrunk output with the saved share', () => {
    expect(describeCompression(10 * 1024 * 1024, 2.5 * 1024 * 1024)).toBe('10.0 MB → 2.5 MB · 节省 75%');
  });

  it('reports honestly when the video did not shrink', () => {
    expect(describeCompression(1024, 2048)).toBe('1 KB → 2 KB · 未能减小体积');
    expect(describeCompression(1024, 1024)).toContain('未能减小体积');
  });

  it('handles missing sizes', () => {
    expect(describeCompression(0, 100)).toBe('已完成');
    expect(describeCompression(-1, 100)).toBe('已完成');
  });
});
