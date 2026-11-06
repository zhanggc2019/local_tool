import { describe, expect, it } from 'vitest';
import { STITCH_MAX_LONG_EDGE, planStitch } from './processor';

describe('long image planning', () => {
  it('uses the widest image as the column width by default', () => {
    const plan = planStitch([{ width: 1080, height: 1920 }, { width: 750, height: 1334 }], 0, 0);
    expect(plan.width).toBe(1080);
    expect(plan.scaled[0]).toEqual({ width: 1080, height: 1920 });
    expect(plan.scaled[1]).toEqual({ width: 1080, height: 1921 });
    expect(plan.totalHeight).toBe(3841);
  });

  it('scales every image to the requested width and adds gaps', () => {
    const plan = planStitch([{ width: 1000, height: 500 }, { width: 500, height: 1000 }], 500, 8);
    expect(plan.width).toBe(500);
    expect(plan.scaled).toEqual([{ width: 500, height: 250 }, { width: 500, height: 1000 }]);
    expect(plan.totalHeight).toBe(250 + 1000 + 8);
  });

  it('rejects empty, oversized, or invalid selections', () => {
    expect(() => planStitch([], 0, 0)).toThrow('请先选择图片');
    expect(() => planStitch(Array.from({ length: 51 }, () => ({ width: 10, height: 10 })), 0, 0)).toThrow('最多拼接 50');
    expect(() => planStitch([{ width: 10, height: 10 }], 0, -1)).toThrow('图片间距');
    expect(() => planStitch([{ width: 0, height: 10 }], 0, 0)).toThrow('图片尺寸');
  });

  it('enforces the width and length limits', () => {
    expect(() => planStitch([{ width: 20000, height: 10 }], 0, 0)).toThrow('目标宽度');
    expect(() => planStitch(Array.from({ length: 10 }, () => ({ width: 1000, height: 5000 })), 0, 0)).toThrow('长度');
  });

  it('enforces the total pixel budget', () => {
    // 16000 x 2000 = 32 MP exactly at the limit; 16000 x 2100 exceeds it.
    const plan = planStitch([{ width: 16000, height: 2000 }], 0, 0);
    expect(plan.totalHeight).toBe(2000);
    expect(() => planStitch([{ width: 16000, height: 2100 }], 0, 0)).toThrow('百万像素');
    expect(STITCH_MAX_LONG_EDGE).toBe(16000);
  });
});
