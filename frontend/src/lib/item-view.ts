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
  // Owner's "really want this"
  starred?: boolean;
  // The owner already has it (bought or received)
  got?: boolean;
  claimed?: boolean;
};

// Same rules as the owner Lambda's parsePrice: "€1.234,56", "£450.00", "US$675.00" → number.
// The last separator followed by 1-2 digits is the decimal point; others are thousands.
function parsePrice(price: string): number | undefined {
  let digits = price.replace(/\s/g, "").match(/\d[\d.,]*/)?.[0];
  if (!digits) return undefined;

  const decimalAt = Math.max(digits.lastIndexOf(","), digits.lastIndexOf("."));
  const isDecimal =
    decimalAt >= 0 && /^[.,]\d{1,2}$/.test(digits.slice(decimalAt));
  digits = isDecimal
    ? digits.slice(0, decimalAt).replace(/[.,]/g, "") +
      "." +
      digits.slice(decimalAt + 1)
    : digits.replace(/[.,]/g, "");

  const value = Number(digits);
  return Number.isFinite(value) ? value : undefined;
}

// Items saved before prices were stored as numbers only have the text, so it's read here too
export const priceValue = (item: ViewableItem) =>
  item.priceValue ?? (item.price ? parsePrice(item.price) : undefined);

const hasPrice = (item: ViewableItem) => priceValue(item) !== undefined;

// Claimed by a guest, or already got by the owner: either way, nobody needs to buy it
export const isUnavailable = (item: ViewableItem) =>
  Boolean(item.claimed || item.got);

export const itemLabel = (item: ViewableItem) =>
  item.title?.trim() || siteName(item.url);

export const itemVendor = (item: ViewableItem) =>
  item.vendor?.trim() || siteName(item.url);

// "Apple · €279,00 · Size M", under the name on a tile. The shop is skipped when it's already
// the name.
export function itemMeta(item: ViewableItem) {
  const vendor = itemVendor(item);
  return [
    vendor !== itemLabel(item) ? vendor : undefined,
    item.price,
    item.size && `Size ${item.size}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// "nothing yet", "1 thing", "6 things"
export const countThings = (count: number) =>
  count === 0 ? "nothing yet" : `${count} ${count === 1 ? "thing" : "things"}`;

export type SortKey =
  "ranking" | "starred" | "priceAsc" | "priceDesc" | "vendor" | "newest";

// "ranking" is named by whoever shows it: "My order" for owners, "List order" for guests
export const SORT_LABELS: Record<Exclude<SortKey, "ranking">, string> = {
  starred: "Want most first",
  priceAsc: "Price: low to high",
  priceDesc: "Price: high to low",
  vendor: "Shop",
  newest: "Newest",
};

export type GroupBy = "none" | "price" | "tag" | "shop";

export const GROUP_LABELS: Record<GroupBy, string> = {
  none: "None",
  price: "Price",
  tag: "Tag",
  shop: "Shop",
};

export type ListView = {
  query: string;
  tags: string[];
  sort: SortKey;
  // Hides what nobody needs to buy: "Available" for guests, "Wanted" for owners
  availableOnly: boolean;
  starredOnly: boolean;
  // A budget: hides what costs more, and what has no price to compare
  maxPrice?: number;
  groupBy: GroupBy;
};

export const DEFAULT_VIEW: ListView = {
  query: "",
  tags: [],
  sort: "ranking",
  availableOnly: false,
  starredOnly: false,
  groupBy: "none",
};

export const isFiltered = (view: ListView) =>
  view.query.trim() !== "" ||
  view.tags.length > 0 ||
  view.availableOnly ||
  view.starredOnly ||
  view.maxPrice !== undefined;

// Filters cleared; how the list is laid out, grouped and sorted stays
export const clearFilters = (view: ListView): ListView => ({
  ...view,
  query: "",
  tags: [],
  availableOnly: false,
  starredOnly: false,
  maxPrice: undefined,
});

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
  // Starred items move up; everything keeps the owner's order otherwise
  starred: (a, b) => Number(b.starred ?? false) - Number(a.starred ?? false),
  // Items without a price go last in both directions
  priceAsc: (a, b) => (priceValue(a) ?? Infinity) - (priceValue(b) ?? Infinity),
  priceDesc: (a, b) =>
    (priceValue(b) ?? -Infinity) - (priceValue(a) ?? -Infinity),
  vendor: (a, b) =>
    itemVendor(a).localeCompare(itemVendor(b)) ||
    itemLabel(a).localeCompare(itemLabel(b)),
  // Older API responses may lack createdAt; those items go last
  newest: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
};

export function applyView<T extends ViewableItem>(
  items: T[],
  view: ListView,
  { last }: { last?: (item: T) => boolean } = {},
): T[] {
  const selectedTags = new Set(view.tags.map(lower));

  const result = items.filter(
    (item) =>
      matchesQuery(item, view.query) &&
      (selectedTags.size === 0 ||
        (item.tags ?? []).some((tag) => selectedTags.has(lower(tag)))) &&
      !(view.availableOnly && isUnavailable(item)) &&
      !(view.starredOnly && !item.starred) &&
      (view.maxPrice === undefined ||
        (priceValue(item) ?? Infinity) <= view.maxPrice),
  );

  if (view.sort !== "ranking") {
    result.sort(comparators[view.sort]);
  }

  // Guests see what's still available first, in whichever order they chose
  if (last) {
    result.sort((a, b) => Number(last(a)) - Number(last(b)));
  }

  return result;
}

// --- Grouping -----------------------------------------------------------------------------
// Prices are typed or scraped text ("€24.59", "£16.85", "US$675.00"). Bands and totals only
// make sense within one currency, so the currency is read from the text and each currency
// gets its own bands. Nothing is converted.

const CURRENCY_ALIASES: Record<string, string> = {
  EUR: "€",
  GBP: "£",
  USD: "$",
  US$: "$",
  JPY: "¥",
  BRL: "R$",
};

// "€", "£", "kr"…; "" when the price has no recognisable currency
export function priceCurrency(price: string | undefined): string {
  if (!price) return "";
  const text = price.trim();
  const symbol =
    text.match(/^([^\d\s.,-]+)\s*\d/)?.[1] ??
    text.match(/\d[\d.,]*\s*([^\d\s.,]+)$/)?.[1] ??
    "";
  return (
    CURRENCY_ALIASES[symbol.toUpperCase()] ?? CURRENCY_ALIASES[symbol] ?? symbol
  );
}

// "€10", "10 kr": symbols go in front, words after
export function formatMoney(amount: number, currency: string) {
  const number = amount.toLocaleString("en-GB", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  if (!currency) return number;
  return /^[A-Za-z]+$/.test(currency)
    ? `${number} ${currency}`
    : `${currency}${number}`;
}

// "89,95" → "€89,95": a price typed as a bare number gets the given currency. Anything else,
// like "about 20" or "£30", is left as it was typed.
export function withCurrency(price: string, currency: string) {
  if (!currency || !/^\d[\d.,]*$/.test(price)) return price;
  return /^[A-Za-z]+$/.test(currency)
    ? `${price} ${currency}`
    : `${currency}${price}`;
}

// The currency most of the list's prices are in; "" when no price has one
export function usualCurrency(items: ViewableItem[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const currency = priceCurrency(item.price);
    if (currency) counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

// Round budgets people actually think in
const PRICE_BANDS = [10, 25, 50, 100, 250];

export type Budget = { value: number; label: string };

// The budgets worth offering for these items: each one keeps something and hides something.
// Amounts are compared as numbers whatever their currency, so a list that mixes currencies
// gets plain numbers for labels.
export function budgetOptions(items: ViewableItem[]): Budget[] {
  const priced = items.filter(hasPrice);
  const currencies = new Set(priced.map((item) => priceCurrency(item.price)));
  const currency = currencies.size === 1 ? [...currencies][0] : "";

  return PRICE_BANDS.filter(
    (limit) =>
      priced.some((item) => priceValue(item)! <= limit) &&
      priced.some((item) => priceValue(item)! > limit),
  ).map((limit) => ({
    value: limit,
    label: `Up to ${formatMoney(limit, currency)}`,
  }));
}

function bandIndex(value: number) {
  const index = PRICE_BANDS.findIndex((limit) => value < limit);
  return index === -1 ? PRICE_BANDS.length : index;
}

function bandLabel(index: number, currency: string) {
  const money = (amount: number) => formatMoney(amount, currency);
  if (index === 0) return `Under ${money(PRICE_BANDS[0])}`;
  if (index === PRICE_BANDS.length) return `${money(PRICE_BANDS.at(-1)!)}+`;
  return `${money(PRICE_BANDS[index - 1])}–${money(PRICE_BANDS[index])}`;
}

export type ItemGroup<T> = {
  key: string;
  label: string;
  // "4 things · €68.40"
  summary: string;
  items: T[];
};

function summarise(items: ViewableItem[]) {
  const count = countThings(items.length);
  const priced = items.filter(hasPrice);
  const currencies = new Set(priced.map((item) => priceCurrency(item.price)));
  // A total across currencies would be meaningless
  if (priced.length === 0 || currencies.size !== 1) return count;

  const total = priced.reduce((sum, item) => sum + priceValue(item)!, 0);
  return `${count} · ${formatMoney(total, [...currencies][0])}`;
}

function toGroups<T extends ViewableItem>(
  entries: { key: string; label: string; items: T[] }[],
): ItemGroup<T>[] {
  return entries
    .filter((entry) => entry.items.length > 0)
    .map((entry) => ({ ...entry, summary: summarise(entry.items) }));
}

// Items keep their order (the chosen sort) inside each group
export function groupItems<T extends ViewableItem>(
  items: T[],
  groupBy: GroupBy,
): ItemGroup<T>[] {
  if (groupBy === "price") {
    // The most used currency first, cheapest band first, then "No price"
    const byCurrency = new Map<string, T[]>();
    for (const item of items.filter(hasPrice)) {
      const currency = priceCurrency(item.price);
      byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), item]);
    }
    const currencies = [...byCurrency.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );

    return toGroups([
      ...currencies.flatMap(([currency, priced]) =>
        Array.from({ length: PRICE_BANDS.length + 1 }, (_, index) => ({
          key: `${currency}:${index}`,
          label: bandLabel(index, currency),
          items: priced.filter(
            (item) => bandIndex(priceValue(item)!) === index,
          ),
        })),
      ),
      {
        key: "no-price",
        label: "No price",
        items: items.filter((item) => !hasPrice(item)),
      },
    ]);
  }

  if (groupBy === "tag") {
    // An item with two tags shows up under both, like a file in two folders
    return toGroups([
      ...collectTags(items).map((tag) => ({
        key: `tag:${lower(tag)}`,
        label: tag,
        items: items.filter((item) =>
          (item.tags ?? []).some((own) => lower(own) === lower(tag)),
        ),
      })),
      {
        key: "no-tag",
        label: "No tag",
        items: items.filter((item) => (item.tags ?? []).length === 0),
      },
    ]);
  }

  if (groupBy === "shop") {
    const shops = [...new Set(items.map(itemVendor))].sort((a, b) =>
      a.localeCompare(b),
    );
    return toGroups(
      shops.map((shop) => ({
        key: `shop:${shop}`,
        label: shop,
        items: items.filter((item) => itemVendor(item) === shop),
      })),
    );
  }

  return toGroups([{ key: "all", label: "", items }]);
}
