import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

// Items are ranked by the owner using fractional index keys ("a0", "a0V", "a1"...): a key can
// always be generated between any two others, so moving an item rewrites only that item.

export const POSITION_PATTERN = /^[0-9A-Za-z]{1,64}$/;

type Ordered = { position?: unknown; createdAt?: unknown; itemId?: unknown };

// Byte order, not locale order: fractional index keys depend on "A" < "Z" < "a"
const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Owner's ranking first; items from before ranking existed fall back to the order they were added
export function compareItems(a: Ordered, b: Ordered) {
  const positionA = typeof a.position === "string" ? a.position : undefined;
  const positionB = typeof b.position === "string" ? b.position : undefined;

  if (positionA && positionB && positionA !== positionB) {
    return compareStrings(positionA, positionB);
  }
  if (positionA && !positionB) return -1;
  if (!positionA && positionB) return 1;

  return (
    compareStrings(String(a.createdAt), String(b.createdAt)) ||
    compareStrings(String(a.itemId), String(b.itemId))
  );
}

const lastPosition = (items: Ordered[]) =>
  items
    .map((item) => item.position)
    .filter((position): position is string => typeof position === "string")
    .sort(compareStrings)
    .at(-1) ?? null;

// Position for a new item at the bottom of the ranking
export function positionAfter(items: Ordered[]) {
  return generateKeyBetween(lastPosition(items), null);
}

// Positions for items saved before ranking existed, appended after any ranked ones
export function backfillPositions(sortedItems: Ordered[]) {
  const unranked = sortedItems.filter(
    (item) => typeof item.position !== "string",
  );
  if (unranked.length === 0) return [];

  const keys = generateNKeysBetween(
    lastPosition(sortedItems),
    null,
    unranked.length,
  );
  return unranked.map((item, index) => ({ item, position: keys[index] }));
}
