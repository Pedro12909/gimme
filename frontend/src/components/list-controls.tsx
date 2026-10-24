import { useState } from "react";
import {
  ArrowUpDownIcon,
  ChevronDownIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  clearFilters,
  GROUP_LABELS,
  isFiltered,
  SORT_LABELS,
  type Budget,
  type GroupBy,
  type Layout,
  type ListView,
  type SortKey,
} from "@/lib/item-view";
import { cn } from "@/lib/utils";

// Guests: below this many items, scanning the list is quicker than searching it.
// Owners always get the controls, since they also use the list as their own tracker.
export const MIN_ITEMS_FOR_GUEST_CONTROLS = 4;

// Takes any button prop, so a chip can also be what opens a menu
function Chip({
  pressed,
  className,
  ...props
}: React.ComponentProps<"button"> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        pressed
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

const LAYOUTS: { value: Layout; label: string; icon: React.ReactNode }[] = [
  { value: "list", label: "List", icon: <ListIcon /> },
  { value: "grid", label: "Grid", icon: <LayoutGridIcon /> },
];

// List for reading and reordering, grid for browsing by photo
function LayoutToggle({
  value,
  onChange,
}: {
  value: Layout;
  onChange: (layout: Layout) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Layout"
      className="flex h-10 shrink-0 rounded-md border p-0.5"
    >
      {LAYOUTS.map((layout) => (
        <button
          key={layout.value}
          type="button"
          aria-label={layout.label}
          aria-pressed={value === layout.value}
          onClick={() => onChange(layout.value)}
          className={cn(
            "flex w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4",
            value === layout.value && "bg-muted text-foreground",
          )}
        >
          {layout.icon}
        </button>
      ))}
    </div>
  );
}

function ViewSheet({
  open,
  onOpenChange,
  view,
  onChange,
  rankingLabel,
  starredFirstLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: ListView;
  onChange: (changes: Partial<ListView>) => void;
  rankingLabel: string;
  // Left out when nothing is starred
  starredFirstLabel?: string;
}) {
  const sorts: { value: SortKey; label: string }[] = [
    { value: "ranking", label: rankingLabel },
    ...(starredFirstLabel
      ? [{ value: "starred" as const, label: starredFirstLabel }]
      : []),
    ...Object.entries(SORT_LABELS).map(([value, label]) => ({
      value: value as SortKey,
      label,
    })),
  ];

  // Changes apply as they're tapped, so the list behind updates live
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Sort and group"
      autoFocus={false}
      footer={
        <Button
          size="lg"
          className="h-11 flex-1 sm:h-9 sm:flex-none"
          onClick={() => onOpenChange(false)}
        >
          Done
        </Button>
      }
    >
      <div className="grid gap-6">
        <fieldset className="grid gap-3">
          <legend className="mb-3 text-sm font-medium">
            {view.groupBy === "none" ? "Sort" : "Sort within groups"}
          </legend>
          <div className="flex flex-wrap gap-2">
            {sorts.map((sort) => (
              <Chip
                key={sort.value}
                pressed={view.sort === sort.value}
                onClick={() => onChange({ sort: sort.value })}
              >
                {sort.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-3 text-sm font-medium">Group by</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GROUP_LABELS) as GroupBy[]).map((groupBy) => (
              <Chip
                key={groupBy}
                pressed={view.groupBy === groupBy}
                onClick={() => onChange({ groupBy })}
              >
                {GROUP_LABELS[groupBy]}
              </Chip>
            ))}
          </div>
          {view.groupBy === "price" && (
            <p className="text-sm text-muted-foreground text-pretty">
              Prices in different currencies are grouped separately.
            </p>
          )}
        </fieldset>
      </div>
    </ResponsiveModal>
  );
}

export function ListControls({
  view,
  onChange,
  tags,
  rankingLabel,
  availableLabel,
  showStarred = false,
  starredLabel = "Starred",
  budgets = [],
  shownCount,
  totalCount,
}: {
  view: ListView;
  onChange: (view: ListView) => void;
  tags: string[];
  // "My order" for owners, "List order" for guests
  rankingLabel: string;
  // "Available" for guests, "Not got yet" for owners; no chip when nothing is unavailable
  availableLabel?: string;
  // Only when something is starred
  showStarred?: boolean;
  // Guests never starred anything themselves, so for them it's "Most wanted"
  starredLabel?: string;
  // Price limits worth offering for this list; none when prices don't spread enough
  budgets?: Budget[];
  shownCount: number;
  totalCount: number;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const set = (changes: Partial<ListView>) => onChange({ ...view, ...changes });

  const toggleTag = (tag: string) =>
    set({
      tags: view.tags.includes(tag)
        ? view.tags.filter((selected) => selected !== tag)
        : [...view.tags, tag],
    });

  // A budget stays visible while it's set, even if the prices it was offered for have changed
  const showBudget = budgets.length > 0 || view.maxPrice !== undefined;
  const hasChips =
    availableLabel || showStarred || showBudget || tags.length > 0;
  // A reminder on the button that the list isn't in its plain order
  const customised = view.groupBy !== "none" || view.sort !== "ranking";
  // A sort that was remembered stays on offer after the last star is removed
  const offerStarredFirst = showStarred || view.sort === "starred";

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search"
            aria-label="Search items"
            value={view.query}
            onChange={(event) => set({ query: event.target.value })}
            className="h-10 pl-9 text-base sm:text-sm"
          />
        </div>

        <LayoutToggle
          value={view.layout}
          onChange={(layout) => set({ layout })}
        />

        {/* Named for what people look for first; grouping is in the same sheet */}
        <Button
          variant="outline"
          className="relative h-10 gap-2"
          aria-label="Sort and group"
          onClick={() => setSheetOpen(true)}
        >
          <ArrowUpDownIcon />
          Sort
          {customised && (
            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-foreground" />
          )}
        </Button>
      </div>

      {hasChips && (
        // One scrollable row on phones instead of wrapping into several lines
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {availableLabel && (
            <Chip
              pressed={view.availableOnly}
              onClick={() => set({ availableOnly: !view.availableOnly })}
            >
              {availableLabel}
            </Chip>
          )}
          {showStarred && (
            <Chip
              pressed={view.starredOnly}
              onClick={() => set({ starredOnly: !view.starredOnly })}
            >
              <StarIcon className="size-3.5 fill-current" />
              {starredLabel}
            </Chip>
          )}
          {showBudget && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Chip pressed={view.maxPrice !== undefined}>
                  {view.maxPrice === undefined
                    ? "Budget"
                    : (budgets.find((budget) => budget.value === view.maxPrice)
                        ?.label ?? `Up to ${view.maxPrice}`)}
                  <ChevronDownIcon className="size-3.5" />
                </Chip>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-40">
                <DropdownMenuRadioGroup
                  value={String(view.maxPrice ?? "")}
                  onValueChange={(value) =>
                    set({ maxPrice: value ? Number(value) : undefined })
                  }
                >
                  <DropdownMenuRadioItem value="">
                    Any price
                  </DropdownMenuRadioItem>
                  {budgets.map((budget) => (
                    <DropdownMenuRadioItem
                      key={budget.value}
                      value={String(budget.value)}
                    >
                      {budget.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {tags.map((tag) => (
            <Chip
              key={tag}
              pressed={view.tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Chip>
          ))}
        </div>
      )}

      {isFiltered(view) && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span aria-live="polite">
            {shownCount} of {totalCount} items
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2"
            onClick={() => onChange(clearFilters(view))}
          >
            <XIcon />
            Clear filters
          </Button>
        </div>
      )}

      <ViewSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        view={view}
        onChange={set}
        rankingLabel={rankingLabel}
        starredFirstLabel={
          offerStarredFirst ? `${starredLabel} first` : undefined
        }
      />
    </div>
  );
}
