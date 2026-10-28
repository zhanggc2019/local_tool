import { describe, expect, it } from 'vitest';
import { planLayout } from './layout';

describe('planLayout', () => {
  it('uses the requested width for a normal page', () => {
    const layout = planLayout([{ width: 595, height: 842 }], 1400, 'single');
    expect(layout.width).toBe(1400);
    expect(layout.height).toBeGreaterThan(1900);
  });

  it('shrinks a long image within both canvas limits', () => {
    const pages = Array.from({ length: 12 }, () => ({ width: 595, height: 842 }));
    const layout = planLayout(pages, 2000, 'single');
    expect(layout.width).toBeLessThan(2000);
    expect(layout.height).toBeLessThanOrEqual(16_000);
    expect(layout.width * layout.height).toBeLessThanOrEqual(20_000_000);
  });

  it('keeps pages separate when split output is selected', () => {
    const pages = Array.from({ length: 12 }, () => ({ width: 595, height: 842 }));
    const layout = planLayout(pages, 2000, 'split');
    expect(layout.width).toBe(2000);
    expect(layout.pageHeights).toHaveLength(12);
    expect(layout.gap).toBe(0);
  });

  it('asks for split output if even a narrow long image cannot fit', () => {
    const pages = Array.from({ length: 100 }, () => ({ width: 595, height: 842 }));
    expect(() => planLayout(pages, 900, 'single')).toThrow(/按页导出/);
  });
});
