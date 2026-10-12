import { ArrowUpDownIcon, SearchIcon, XIcon } from "lucide-react";
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
  DEFAULT_VIEW,
  isFiltered,
  SORT_LABELS,
  type ListView,
  type SortKey,
} from "@/lib/item-view";
import { cn } from "@/lib/utils";

// Below this many items, scanning the list is quicker than searching it
export const MIN_ITEMS_FOR_CONTROLS = 4;

function Chip({
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
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-sm transition-colors",
        pressed
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
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
  showAvailableFilter = false,
  shownCount,
  totalCount,
}: {
  view: ListView;
  onChange: (view: ListView) => void;
  tags: string[];
  // "My order" for owners, "List order" for guests
  rankingLabel: string;
  showAvailableFilter?: boolean;
  shownCount: number;
  totalCount: number;
}) {
  const set = (changes: Partial<ListView>) => onChange({ ...view, ...changes });
  const sortLabel =
    view.sort === "ranking" ? rankingLabel : SORT_LABELS[view.sort];

  const toggleTag = (tag: string) =>
    set({
      tags: view.tags.includes(tag)
        ? view.tags.filter((selected) => selected !== tag)
        : [...view.tags, tag],
    });

  const hasChips = showAvailableFilter || tags.length > 0;

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 gap-2"
              aria-label={`Sort: ${sortLabel}`}
            >
              <ArrowUpDownIcon />
              {/* The label is hidden on narrow screens to leave room for search */}
              <span className="hidden sm:inline">{sortLabel}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuRadioGroup
              value={view.sort}
              onValueChange={(sort) => set({ sort: sort as SortKey })}
            >
              <DropdownMenuRadioItem value="ranking">
                {rankingLabel}
              </DropdownMenuRadioItem>
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasChips && (
        // One scrollable row on phones instead of wrapping into several lines
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {showAvailableFilter && (
            <Chip
              pressed={view.availableOnly}
              onClick={() => set({ availableOnly: !view.availableOnly })}
            >
              Available
            </Chip>
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
            onClick={() => onChange({ ...DEFAULT_VIEW, sort: view.sort })}
          >
            <XIcon />
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
