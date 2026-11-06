import { describe, expect, it } from 'vitest';
import { describeChange, formatSize } from './format';

describe('shared size formatting', () => {
  it('formats bytes across units', () => {
    expect(formatSize(0)).toBe('1 KB');
    expect(formatSize(800 * 1024)).toBe('800 KB');
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
    expect(formatSize(2.4 * 1024 * 1024 * 1024)).toBe('2.40 GB');
    expect(formatSize(-1)).toBe('—');
    expect(formatSize(Number.NaN)).toBe('—');
  });

  it('describes shrunk, unchanged, and invalid results', () => {
    expect(describeChange(10 * 1024 * 1024, 2.5 * 1024 * 1024)).toBe('10.0 MB → 2.5 MB · 节省 75%');
    expect(describeChange(1024, 1024)).toContain('未能减小体积');
    expect(describeChange(1024, 2048)).toContain('未能减小体积');
    expect(describeChange(0, 10)).toBe('已完成');
  });
});
