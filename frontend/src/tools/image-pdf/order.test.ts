import { describe, expect, it } from 'vitest';
import { initialOrder, isValidOrder, moveOrderEntry } from './order';

describe('image to PDF ordering', () => {
  it('builds an initial identity order', () => {
    expect(initialOrder(3)).toEqual([0, 1, 2]);
    expect(initialOrder(0)).toEqual([]);
  });

  it('accepts exact permutations only', () => {
    expect(isValidOrder([2, 0, 1], 3)).toBe(true);
    expect(isValidOrder([0, 1, 1], 3)).toBe(false);
    expect(isValidOrder([0, 1, 3], 3)).toBe(false);
    expect(isValidOrder([-1, 1, 2], 3)).toBe(false);
    expect(isValidOrder([0, 1], 3)).toBe(false);
    expect(isValidOrder([], 0)).toBe(true);
    expect(isValidOrder([0.5, 1, 2], 3)).toBe(false);
  });

  it('moves entries within bounds and ignores invalid moves', () => {
    expect(moveOrderEntry([0, 1, 2], 0, 2)).toEqual([1, 2, 0]);
    expect(moveOrderEntry([0, 1, 2], 2, 0)).toEqual([2, 0, 1]);
    expect(moveOrderEntry([0, 1, 2], 1, 1)).toEqual([0, 1, 2]);
    expect(moveOrderEntry([0, 1, 2], -1, 1)).toEqual([0, 1, 2]);
    expect(moveOrderEntry([0, 1, 2], 0, 9)).toEqual([0, 1, 2]);
  });

  it('does not mutate the original array', () => {
    const order = [0, 1, 2];
    moveOrderEntry(order, 0, 2);
    expect(order).toEqual([0, 1, 2]);
  });
});
