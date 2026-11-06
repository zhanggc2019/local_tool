import { describe, expect, it } from 'vitest';
import { STAMP_ANCHORS, anchorPosition, clampNumber, isStampAnchor, tilePositions } from './processor';

describe('image watermark placement', () => {
  it('offers nine anchors and a tile option', () => {
    expect(STAMP_ANCHORS).toHaveLength(9);
    expect(isStampAnchor('tile')).toBe(true);
    expect(isStampAnchor('br')).toBe(true);
    expect(isStampAnchor('center')).toBe(false);
  });

  it('computes each anchor corner inside the margins', () => {
    const width = 1000;
    const height = 800;
    const contentWidth = 100;
    const contentHeight = 40;
    const margin = 20;
    expect(anchorPosition(width, height, contentWidth, contentHeight, 'tl', margin)).toEqual({ x: 20, y: 20 });
    expect(anchorPosition(width, height, contentWidth, contentHeight, 'tc', margin)).toEqual({ x: 450, y: 20 });
    expect(anchorPosition(width, height, contentWidth, contentHeight, 'tr', margin)).toEqual({ x: 880, y: 20 });
    expect(anchorPosition(width, height, contentWidth, contentHeight, 'ml', margin)).toEqual({ x: 20, y: 380 });
    expect(anchorPosition(width, height, contentWidth, contentHeight, 'mc', margin)).toEqual({ x: 450, y: 380 });
    expect(anchorPosition(width, height, contentWidth, contentHeight, 'mr', margin)).toEqual({ x: 880, y: 380 });
    expect(anchorPosition(width, height, contentWidth, contentHeight, 'bl', margin)).toEqual({ x: 20, y: 740 });
    expect(anchorPosition(width, height, contentWidth, contentHeight, 'bc', margin)).toEqual({ x: 450, y: 740 });
    expect(anchorPosition(width, height, contentWidth, contentHeight, 'br', margin)).toEqual({ x: 880, y: 740 });
  });

  it('tiles positions across the whole canvas', () => {
    const positions = tilePositions(300, 200, 100, 40, 10);
    expect(positions.length).toBeGreaterThan(4);
    // Every point stays within one tile of the canvas bounds.
    for (const point of positions) {
      expect(point.x).toBeGreaterThanOrEqual(-100);
      expect(point.x).toBeLessThan(300 + 100);
      expect(point.y).toBeGreaterThanOrEqual(-40);
      expect(point.y).toBeLessThan(200 + 40);
    }
  });

  it('returns no tiles for empty canvases', () => {
    expect(tilePositions(0, 100, 10, 10, 5)).toEqual([]);
    expect(tilePositions(100, 0, 10, 10, 5)).toEqual([]);
  });

  it('clamps numeric options', () => {
    expect(clampNumber(36, 12, 160)).toBe(36);
    expect(clampNumber(2, 12, 160)).toBe(12);
    expect(clampNumber(999, 12, 160)).toBe(160);
    expect(clampNumber(Number.NaN, 5, 100)).toBe(5);
  });
});
