// Must match the backend (lambda/shared/limits.ts), which enforces them
export const MAX_LISTS_PER_OWNER = 10;
export const MAX_ITEMS_PER_LIST = 50;

// Shown where adding is refused because the list is full
export const FULL_NOTICE = `This list has ${MAX_ITEMS_PER_LIST} items, the most it can hold. Remove one to add another.`;
