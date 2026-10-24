import { StarIcon } from "lucide-react";
import { ItemThumbnail } from "@/components/item-thumbnail";
import { itemLabel, itemVendor, type ViewableItem } from "@/lib/item-view";
import { cn } from "@/lib/utils";

// Wide cards have room for a few tags; narrow ones show the first and count the rest
const MAX_VISIBLE_TAGS = 3;

// A text-first square card for the grid layout: shop, name, tags and price, with the photo as
// a thumbnail in the corner. Each card is its own container, so its type and thumbnail step
// up as it gets wider (14rem, then @2xs), whatever the screen size. Notes and other shops
// live in the item's sheet.
export function ItemCard({
  item,
  onOpen,
  dimmed = false,
  status,
  action,
}: {
  item: ViewableItem;
  onOpen: () => void;
  dimmed?: boolean;
  // e.g. "Claimed by Ana" or "Got it"
  status?: string;
  // e.g. the guest's Claim button
  action?: React.ReactNode;
}) {
  const label = itemLabel(item);
  const vendor = itemVendor(item);
  // The shop is skipped when it's already the name
  const shop = vendor !== label ? vendor : undefined;
  const tags = item.tags ?? [];

  return (
    <li className="@container flex min-w-0 flex-col">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          // Square unless the content needs more; growing keeps a row's cards the same height then
          "flex aspect-square w-full grow flex-col justify-between gap-1 rounded-xl border p-3 text-left transition-colors hover:border-foreground/30 @[14rem]:p-4 @2xs:p-5",
          dimmed && "opacity-50",
        )}
      >
        <div className="w-full min-w-0">
          {(shop || item.starred) && (
            <div className="mb-0.5 flex items-center gap-2 @2xs:mb-1">
              <p className="min-w-0 flex-1 truncate text-[13px]/4.5 text-muted-foreground @[14rem]:text-sm @2xs:text-base/5.5">
                {shop}
              </p>
              {/* Starred items are what the owner really wants; owners and guests both see it */}
              {item.starred && (
                <StarIcon
                  aria-label="Starred"
                  className="size-3.5 shrink-0 fill-current @2xs:size-4"
                />
              )}
            </div>
          )}
          {/* The narrowest cards only fit two lines of name next to everything else */}
          <p className="line-clamp-2 text-sm/4.5 font-semibold @[10.5rem]:line-clamp-3 @[14rem]:text-base/5.5 @2xs:text-xl/6.5 @2xs:tracking-tight">
            {label}
          </p>
          {item.size && (
            <p className="mt-1.5 hidden truncate text-sm text-muted-foreground @2xs:block">
              {item.size}
            </p>
          )}
          {/* Why an item can't be claimed matters more than its tags */}
          {status ? (
            <p className="mt-1.5 truncate text-[13px]/4.5 text-muted-foreground @[14rem]:text-sm @2xs:mt-2.5">
              {status}
            </p>
          ) : (
            tags.length > 0 && (
              <ul
                aria-label="Tags"
                className="mt-1.5 flex items-center gap-1 overflow-hidden @2xs:mt-2.5"
              >
                {tags.slice(0, MAX_VISIBLE_TAGS).map((tag, index) => (
                  <li
                    key={tag}
                    className={cn(
                      "truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground",
                      index > 0 && "hidden shrink-0 @2xs:block",
                    )}
                  >
                    {tag}
                  </li>
                ))}
                {tags.length > 1 && (
                  <li className="shrink-0 text-xs text-muted-foreground @2xs:hidden">
                    +{tags.length - 1}
                  </li>
                )}
                {tags.length > MAX_VISIBLE_TAGS && (
                  <li className="hidden shrink-0 text-xs text-muted-foreground @2xs:block">
                    +{tags.length - MAX_VISIBLE_TAGS}
                  </li>
                )}
              </ul>
            )
          )}
        </div>
        <div className="flex w-full items-end justify-between gap-2">
          <p className="truncate text-[13px]/4.5 font-medium @[14rem]:text-sm @2xs:text-base/5.5">
            {item.price}
          </p>
          {item.imageUrl && (
            <ItemThumbnail
              src={item.imageUrl}
              className="size-10 @[14rem]:size-14 @2xs:size-18"
            />
          )}
        </div>
      </button>
      {action && <div className="mt-2">{action}</div>}
    </li>
  );
}

export function ItemGrid({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
      {children}
    </ul>
  );
}
