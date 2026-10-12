import { siteName } from "@/lib/links";

// Shared by the owner and guest views: how an item is described, searched, filtered and sorted

export type ViewableItem = {
  itemId: string;
  url: string;
  title?: string;
  note?: string;
  imageUrl?: string;
  price?: string;
  priceValue?: number;
  vendor?: string;
  size?: string;
  tags?: string[];
  alternatives?: string[];
  createdAt: string;
  claimed?: boolean;
};

export const itemLabel = (item: ViewableItem) =>
  item.title?.trim() || siteName(item.url);

export const itemVendor = (item: ViewableItem) =>
  item.vendor?.trim() || siteName(item.url);

// "€19.99 · Amazon · Size M · gift wrap please". The shop is skipped when it's already the name.
export function itemDetails(item: ViewableItem) {
  const vendor = itemVendor(item);
  return [
    item.price,
    vendor !== itemLabel(item) ? vendor : undefined,
    item.size,
    item.note,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type SortKey =
  "ranking" | "priceAsc" | "priceDesc" | "vendor" | "newest";

export const SORT_LABELS: Record<Exclude<SortKey, "ranking">, string> = {
  priceAsc: "Price: low to high",
  priceDesc: "Price: high to low",
  vendor: "Shop",
  newest: "Newest",
};

export type ListView = {
  query: string;
  tags: string[];
  sort: SortKey;
  availableOnly: boolean;
};

export const DEFAULT_VIEW: ListView = {
  query: "",
  tags: [],
  sort: "ranking",
  availableOnly: false,
};

export const isFiltered = (view: ListView) =>
  view.query.trim() !== "" || view.tags.length > 0 || view.availableOnly;

const lower = (text: string) => text.toLocaleLowerCase();

// Every tag used in the list, one spelling each, most used first
export function collectTags(items: ViewableItem[]) {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const tag of items.flatMap((item) => item.tags ?? [])) {
    const entry = counts.get(lower(tag));
    if (entry) entry.count++;
    else counts.set(lower(tag), { tag, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .map(({ tag }) => tag);
}

function matchesQuery(item: ViewableItem, query: string) {
  const words = lower(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = lower(
    [
      itemLabel(item),
      itemVendor(item),
      item.note,
      item.size,
      ...(item.tags ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  return words.every((word) => haystack.includes(word));
}

// Items arrive in the owner's ranking, so "ranking" keeps them as they are
const comparators: Record<
  Exclude<SortKey, "ranking">,
  (a: ViewableItem, b: ViewableItem) => number
> = {
  // Items without a price go last in both directions
  priceAsc: (a, b) => (a.priceValue ?? Infinity) - (b.priceValue ?? Infinity),
  priceDesc: (a, b) =>
    (b.priceValue ?? -Infinity) - (a.priceValue ?? -Infinity),
  vendor: (a, b) =>
    itemVendor(a).localeCompare(itemVendor(b)) ||
    itemLabel(a).localeCompare(itemLabel(b)),
  // Older API responses may lack createdAt; those items go last
  newest: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
};

export function applyView<T extends ViewableItem>(
  items: T[],
  view: ListView,
  { claimedLast = false }: { claimedLast?: boolean } = {},
): T[] {
  const selectedTags = new Set(view.tags.map(lower));

  const result = items.filter(
    (item) =>
      matchesQuery(item, view.query) &&
      (selectedTags.size === 0 ||
        (item.tags ?? []).some((tag) => selectedTags.has(lower(tag)))) &&
      !(view.availableOnly && item.claimed),
  );

  if (view.sort !== "ranking") {
    result.sort(comparators[view.sort]);
  }

  // Guests see what's still available first, in whichever order they chose
  if (claimedLast) {
    result.sort(
      (a, b) => Number(Boolean(a.claimed)) - Number(Boolean(b.claimed)),
    );
  }

  return result;
}
