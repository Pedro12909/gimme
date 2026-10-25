import { useState } from "react";
import {
  clearFilters,
  GROUP_LABELS,
  isFiltered,
  SORT_LABELS,
  type Budget,
  type GroupBy,
  type ListView,
  type SortKey,
} from "@/lib/item-view";
import { cn } from "@/lib/utils";

// Guests: below this many items, scanning the list is quicker than searching it.
// Owners always get the controls, since they also use the list as their own tracker.
export const MIN_ITEMS_FOR_GUEST_CONTROLS = 4;

// "Sort: My order" as plain text, with the device's own picker laid invisibly over it
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const current = options.find((option) => option.value === value);

  return (
    <label className="action relative gap-1 no-underline">
      <span className="text-muted">{label}:</span>
      <span className="underline underline-offset-3">
        {current?.label ?? options[0].label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// A filter word: ink and medium when on, muted when off
function Toggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn("action", pressed ? "font-medium" : "text-muted")}
    >
      {children}
    </button>
  );
}

export function ListControls({
  view,
  onChange,
  tags,
  rankingLabel,
  availableLabel,
  showStarred = false,
  budgets = [],
  shownCount,
  totalCount,
}: {
  view: ListView;
  onChange: (view: ListView) => void;
  tags: string[];
  // "My order" for owners, "List order" for guests
  rankingLabel: string;
  // "Available" for guests, "Not got yet" for owners; left out when everything is available
  availableLabel?: string;
  // Only when something is starred
  showStarred?: boolean;
  // Price limits worth offering for this list; none when prices don't spread enough
  budgets?: Budget[];
  shownCount: number;
  totalCount: number;
}) {
  const [searching, setSearching] = useState(view.query !== "");
  const set = (changes: Partial<ListView>) => onChange({ ...view, ...changes });

  const toggleTag = (tag: string) =>
    set({
      tags: view.tags.includes(tag)
        ? view.tags.filter((selected) => selected !== tag)
        : [...view.tags, tag],
    });

  // A sort that was remembered stays on offer after the last star is removed
  const offerStarredFirst = showStarred || view.sort === "starred";
  const sorts: { value: SortKey; label: string }[] = [
    { value: "ranking", label: rankingLabel },
    ...(Object.entries(SORT_LABELS) as [SortKey, string][])
      .filter(([value]) => value !== "starred" || offerStarredFirst)
      .map(([value, label]) => ({ value, label })),
  ];
  const groups = (Object.keys(GROUP_LABELS) as GroupBy[]).map((groupBy) => ({
    value: groupBy,
    label: GROUP_LABELS[groupBy],
  }));
  // A budget stays visible while it's set, even if the prices it was offered for have changed
  const showBudget = budgets.length > 0 || view.maxPrice !== undefined;
  const budgetOptions = [
    { value: "", label: "Any" },
    ...budgets.map((budget) => ({
      value: String(budget.value),
      label: budget.label,
    })),
    ...(view.maxPrice !== undefined &&
    !budgets.some((budget) => budget.value === view.maxPrice)
      ? [{ value: String(view.maxPrice), label: `Up to ${view.maxPrice}` }]
      : []),
  ];

  const hasToggles = availableLabel || showStarred || tags.length > 0;

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-x-6">
        {searching ? (
          <div className="flex w-full items-center gap-4 sm:w-80">
            <input
              type="search"
              aria-label="Search this list"
              placeholder="Search"
              autoFocus
              value={view.query}
              onChange={(event) => set({ query: event.target.value })}
              className="field min-h-11 min-w-0 flex-1 py-2"
            />
            <button
              type="button"
              className="action"
              onClick={() => {
                set({ query: "" });
                setSearching(false);
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="action"
            onClick={() => setSearching(true)}
          >
            Search
          </button>
        )}
        <Choice
          label="Sort"
          value={view.sort}
          options={sorts}
          onChange={(sort) => set({ sort })}
        />
        <Choice
          label="Group"
          value={view.groupBy}
          options={groups}
          onChange={(groupBy) => set({ groupBy })}
        />
        {showBudget && (
          <Choice
            label="Budget"
            value={view.maxPrice === undefined ? "" : String(view.maxPrice)}
            options={budgetOptions}
            onChange={(value) =>
              set({ maxPrice: value ? Number(value) : undefined })
            }
          />
        )}
      </div>

      {hasToggles && (
        <div className="flex flex-wrap gap-x-5">
          {showStarred && (
            <Toggle
              pressed={view.starredOnly}
              onClick={() => set({ starredOnly: !view.starredOnly })}
            >
              Want most
            </Toggle>
          )}
          {availableLabel && (
            <Toggle
              pressed={view.availableOnly}
              onClick={() => set({ availableOnly: !view.availableOnly })}
            >
              {availableLabel}
            </Toggle>
          )}
          {tags.map((tag) => (
            <Toggle
              key={tag}
              pressed={view.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Toggle>
          ))}
        </div>
      )}

      {isFiltered(view) && (
        <p className="flex items-center gap-3 text-muted">
          <span aria-live="polite">
            Showing {shownCount} of {totalCount}
          </span>
          <button
            type="button"
            className="action text-ink"
            onClick={() => {
              onChange(clearFilters(view));
              setSearching(false);
            }}
          >
            Clear
          </button>
        </p>
      )}
    </div>
  );
}
