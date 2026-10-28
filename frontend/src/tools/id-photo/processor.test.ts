import { describe, expect, it } from 'vitest';
import { calculatePlacement, PHOTO_SPECS } from './processor';

describe('ID photo crop', () => {
  it('provides the exact one-inch and two-inch pixel sizes', () => {
    expect([PHOTO_SPECS.one.width, PHOTO_SPECS.one.height]).toEqual([295, 413]);
    expect([PHOTO_SPECS.two.width, PHOTO_SPECS.two.height]).toEqual([413, 579]);
  });

  it('covers the output and clamps panning within the source image', () => {
    const crop = calculatePlacement(900, 1200, 295, 413, 1.4, 10, -10);
    expect(crop.x).toBeLessThanOrEqual(0);
    expect(crop.y).toBeLessThanOrEqual(0);
    expect(crop.x + crop.width).toBeGreaterThanOrEqual(295);
    expect(crop.y + crop.height).toBeGreaterThanOrEqual(413);
    expect(crop.panX).toBeLessThan(10);
    expect(crop.panY).toBeGreaterThan(-10);
  });
});
