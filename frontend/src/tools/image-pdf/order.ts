/** Checks that an order array is a permutation of the selection indices. */
export function isValidOrder(order: number[], count: number): boolean {
  if (!Array.isArray(order) || order.length !== count) return false;
  const seen = new Set<number>();
  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= count || seen.has(index)) return false;
    seen.add(index);
  }
  return true;
}

/** Moves one entry inside an order array and returns the new order. */
export function moveOrderEntry(order: number[], from: number, to: number): number[] {
  if (!Array.isArray(order) || from < 0 || from >= order.length || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}

/** Initial order for a selection of the given length. */
export function initialOrder(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}
