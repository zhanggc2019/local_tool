import { describe, expect, it } from 'vitest';
import { allCategoriesCollapsed, defaultCollapsedCategories, parseCollapsedCategories, serializeCollapsedCategories, toggleCategory } from './nav-collapse';

describe('sidebar collapse state', () => {
  it('parses persisted lists defensively', () => {
    expect(parseCollapsedCategories(null)).toEqual([]);
    expect(parseCollapsedCategories('')).toEqual([]);
    expect(parseCollapsedCategories('not json')).toEqual([]);
    expect(parseCollapsedCategories('{"pdf":true}')).toEqual([]);
    expect(parseCollapsedCategories('["pdf","media",3,null]')).toEqual(['pdf', 'media']);
    expect(parseCollapsedCategories('[""]')).toEqual([]);
  });

  it('serializes a stable, deduplicated list', () => {
    expect(serializeCollapsedCategories(['media', 'pdf', 'media', ''])).toBe('["media","pdf"]');
    expect(serializeCollapsedCategories([])).toBe('[]');
  });

  it('toggles one category without mutating the input', () => {
    const original = ['pdf'];
    expect(toggleCategory(original, 'media', true)).toEqual(['pdf', 'media']);
    expect(toggleCategory(original, 'pdf', false)).toEqual([]);
    expect(original).toEqual(['pdf']);
  });

  it('detects when every category is collapsed', () => {
    const categories = ['pdf', 'image', 'media', 'utility'];
    expect(allCategoriesCollapsed(categories, categories)).toBe(true);
    expect(allCategoriesCollapsed(['pdf', 'image'], categories)).toBe(false);
    expect(allCategoriesCollapsed([], [])).toBe(false);
  });

  it('defaults to collapsing everything except the first group', () => {
    expect(defaultCollapsedCategories(['pdf', 'image', 'media', 'utility'])).toEqual(['image', 'media', 'utility']);
    expect(defaultCollapsedCategories(['pdf'])).toEqual([]);
    expect(defaultCollapsedCategories([])).toEqual([]);
  });
});
