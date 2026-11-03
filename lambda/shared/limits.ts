// Per-owner caps. Must match the frontend (frontend/src/lib/limits.ts).
// Owners already over a cap keep what they have; only new lists or items are refused.
export const MAX_LISTS_PER_OWNER = 10;
export const MAX_ITEMS_PER_LIST = 50;
