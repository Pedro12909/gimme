// Must match the backend (lambda/shared/item-order.ts): fractional index keys compare in byte
// order, not locale order, so "A" < "Z" < "a"
const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function sortByPosition<
  T extends { position?: string; createdAt: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.position && b.position && a.position !== b.position) {
      return compareKeys(a.position, b.position);
    }
    if (a.position && !b.position) return -1;
    if (!a.position && b.position) return 1;
    return compareKeys(a.createdAt, b.createdAt);
  });
}
