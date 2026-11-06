/** localStorage key for the collapsed sidebar categories. */
export const NAV_COLLAPSE_KEY = 'local-toolbox.nav-collapsed';

/** Parses the persisted collapse list defensively. */
export function parseCollapsedCategories(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
  } catch {
    return [];
  }
}

/** Serializes the collapse list into a stable, deduplicated form. */
export function serializeCollapsedCategories(categories: Iterable<string>): string {
  return JSON.stringify(Array.from(new Set(categories)).filter((category) => category.length > 0).sort());
}

/** Returns a new list with one category collapsed or expanded. */
export function toggleCategory(collapsed: string[], category: string, isCollapsed: boolean): string[] {
  const next = new Set(collapsed);
  if (isCollapsed) next.add(category);
  else next.delete(category);
  return Array.from(next);
}

/** Returns true when every category is collapsed. */
export function allCategoriesCollapsed(collapsed: string[], categories: string[]): boolean {
  return categories.length > 0 && categories.every((category) => collapsed.includes(category));
}

/** Defaults to collapsing every group except the first one. */
export function defaultCollapsedCategories(categories: string[]): string[] {
  return categories.slice(1);
}
