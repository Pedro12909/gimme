import { useMemo, useState } from "react";
import { ExternalLinkIcon, StarIcon } from "lucide-react";
import { GroupedItems } from "@/components/grouped-items";
import { ItemCard, ItemGrid } from "@/components/item-card";
import { ItemName, ItemSummary } from "@/components/item-summary";
import { ItemThumbnail } from "@/components/item-thumbnail";
import {
  ListControls,
  MIN_ITEMS_FOR_GUEST_CONTROLS,
} from "@/components/list-controls";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { describeEventDate } from "@/lib/event-date";
import type { SharedItem, SharedList } from "@/lib/guest-api";
import {
  applyView,
  budgetOptions,
  collectTags,
  groupItems,
  isUnavailable,
  itemLabel,
  itemVendor,
  type ListView,
} from "@/lib/item-view";
import { safeHref, siteName } from "@/lib/links";
import { useJustChanged } from "@/lib/use-just-changed";
import { cn } from "@/lib/utils";

// What a guest sees of a list. Used by the shared link itself and by the owner's preview,
// which passes items with every claim left out.

export type GuestActions = {
  onClaim: (item: SharedItem) => void;
  onUnclaim: (item: SharedItem) => void;
  // The item being released right now, if any
  unclaimingId?: string;
  // Claimed from this browser, so this guest can release it
  isMine: (item: SharedItem) => boolean;
};

// Why an item can't be claimed, if it can't
function guestStatus(item: SharedItem, mine: boolean) {
  if (item.got) return "They already have it";
  if (!item.claimed) return undefined;
  if (mine) return "Claimed by you";
  return item.claimerName ? `Claimed by ${item.claimerName}` : "Claimed";
}

// "€24.59 · Size M · Amazon": the facts that matter when buying
function buyingDetails(item: SharedItem) {
  const vendor = itemVendor(item);
  return [item.price, item.size, vendor !== itemLabel(item) && vendor]
    .filter(Boolean)
    .join(" · ");
}

// Photo, full name and price: enough to be sure which item a sheet is about
export function ItemHeadline({ item }: { item: SharedItem }) {
  const details = buyingDetails(item);

  return (
    <div className="flex items-center gap-3">
      <ItemThumbnail src={item.imageUrl} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-3 font-medium">
          <ItemName item={item} />
        </p>
        {details && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {details}
          </p>
        )}
      </div>
    </div>
  );
}

// "Go to Amazon": the next step once a guest has decided on something
export function ShopButton({
  item,
  variant = "outline",
  className,
  onClick,
}: {
  item: SharedItem;
  variant?: "outline" | "default";
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  const href = safeHref(item.url);
  if (!href) return null;

  return (
    <Button asChild variant={variant} size="lg" className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        Go to {itemVendor(item)}
        <ExternalLinkIcon />
      </a>
    </Button>
  );
}

// Claim or Unclaim, whichever applies. They swap places after each tap, so a double tap is
// ignored for a moment rather than undoing what the first tap did.
function ClaimAction({
  item,
  actions,
  className,
}: {
  item: SharedItem;
  actions: GuestActions;
  className?: string;
}) {
  const mine = item.claimed && actions.isMine(item);
  const tooSoon = useJustChanged(`${item.claimed}:${mine}`);

  if (mine) {
    return (
      <Button
        variant="outline"
        size="lg"
        className={className}
        onClick={() => !tooSoon() && actions.onUnclaim(item)}
        disabled={actions.unclaimingId === item.itemId}
      >
        Unclaim
      </Button>
    );
  }
  if (isUnavailable(item)) return null;

  return (
    <Button
      variant="outline"
      size="lg"
      className={className}
      onClick={() => !tooSoon() && actions.onClaim(item)}
    >
      Claim
    </Button>
  );
}

function GuestItemRow({
  item,
  actions,
  onOpen,
}: {
  item: SharedItem;
  actions: GuestActions;
  onOpen: () => void;
}) {
  const mine = actions.isMine(item);
  const status = guestStatus(item, mine);

  return (
    <li className="flex items-center gap-2">
      {/* Tapping the item shows everything about it; the shop link lives in there */}
      <button
        type="button"
        onClick={onOpen}
        className="-ml-2 flex min-w-0 flex-1 rounded-md py-3 pl-2 text-left hover:bg-muted/50"
      >
        {/* Their own claim isn't greyed out: it's the one they still have to go and buy */}
        <ItemSummary item={item} dimmed={isUnavailable(item) && !mine}>
          {status && (
            <p className="mt-0.5 text-sm text-muted-foreground">{status}</p>
          )}
        </ItemSummary>
      </button>
      <ClaimAction item={item} actions={actions} />
    </li>
  );
}

// Everything about one item: the list row only has room for a summary
function ItemDetailSheet({
  item,
  actions,
  onClose,
}: {
  item: SharedItem | undefined;
  actions: GuestActions;
  onClose: () => void;
}) {
  const mine = item !== undefined && item.claimed && actions.isMine(item);
  const status = item ? guestStatus(item, mine) : undefined;
  const details = item ? buyingDetails(item) : "";
  const otherShops = (item?.alternatives ?? [])
    .map((link) => ({ link, href: safeHref(link) }))
    .filter((shop) => shop.href);

  return (
    <ResponsiveModal
      open={item !== undefined}
      onOpenChange={(open) => !open && onClose()}
      title={item ? <ItemName item={item} /> : ""}
      wrapTitle
      autoFocus={false}
      footer={
        item && (
          <>
            <ShopButton
              item={item}
              // Once it's theirs, buying it is the next step
              variant={mine ? "default" : "outline"}
              className="h-11 flex-1 sm:h-9 sm:flex-none"
            />
            {!isUnavailable(item) && (
              <Button
                size="lg"
                className="h-11 flex-1 sm:h-9 sm:flex-none"
                onClick={() => {
                  onClose();
                  actions.onClaim(item);
                }}
              >
                Claim
              </Button>
            )}
            {mine && (
              <Button
                variant="outline"
                size="lg"
                className="h-11 flex-1 sm:h-9 sm:flex-none"
                onClick={() => {
                  onClose();
                  actions.onUnclaim(item);
                }}
              >
                Unclaim
              </Button>
            )}
          </>
        )
      }
    >
      {item && (
        <div className="grid gap-4">
          {item.imageUrl && (
            // Product photos are shot on white, so they keep a white tile in dark mode too
            <div className="flex h-56 items-center justify-center rounded-lg bg-white p-4">
              <img
                src={item.imageUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}

          {(details || status) && (
            <div className="grid gap-1">
              {details && <p className="font-medium">{details}</p>}
              {status && (
                <p className="text-sm text-muted-foreground">{status}</p>
              )}
              {/* A claim can only be undone where it was made, and nothing else here says so */}
              {item.claimed && !mine && (
                <p className="text-sm text-muted-foreground text-pretty">
                  Was this you, on another phone or computer? You can only
                  unclaim it there.
                </p>
              )}
            </div>
          )}

          {item.note && (
            <p className="whitespace-pre-line text-pretty">{item.note}</p>
          )}

          {otherShops.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Also at{" "}
              {otherShops.map((shop, index) => (
                <span key={shop.link}>
                  {index > 0 && ", "}
                  <a
                    href={shop.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {siteName(shop.link)}
                  </a>
                </span>
              ))}
            </p>
          )}

          {(item.tags ?? []).length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="Tags">
              {item.tags!.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}

export function GuestListView({
  list,
  items,
  actions,
  view,
  onViewChange,
  notice,
}: {
  list: Pick<SharedList, "title" | "description" | "eventDate">;
  items: SharedItem[];
  actions: GuestActions;
  // Owned by the page, which also needs the layout to set its width
  view: ListView;
  onViewChange: (view: ListView) => void;
  // Shown above the items, e.g. the owner's preview banner
  notice?: React.ReactNode;
}) {
  const [viewingId, setViewingId] = useState<string>();

  const tags = useMemo(() => collectTags(items), [items]);
  const budgets = useMemo(() => budgetOptions(items), [items]);
  const anyStarred = items.some((item) => item.starred);
  // Claimed from this browser
  const mine = useMemo(
    () => items.filter((item) => item.claimed && actions.isMine(item)),
    [items, actions],
  );
  // Items arrive in the owner's order; what can't be claimed goes last whichever sort is
  // chosen. A guest's own claims stay put, so an item doesn't vanish as they claim it.
  const shown = useMemo(
    () =>
      applyView(items, view, {
        last: (item) => isUnavailable(item) && !mine.includes(item),
      }),
    [items, view, mine],
  );
  const groups = useMemo(
    () => groupItems(shown, view.groupBy),
    [shown, view.groupBy],
  );
  // Looked up by id, so the sheet follows the item when a claim changes it
  const viewing = items.find((item) => item.itemId === viewingId);

  const renderItems = (group: SharedItem[]) =>
    view.layout === "grid" ? (
      <ItemGrid>
        {group.map((item) => (
          <ItemCard
            key={item.itemId}
            item={item}
            onOpen={() => setViewingId(item.itemId)}
            dimmed={isUnavailable(item) && !mine.includes(item)}
            status={guestStatus(item, actions.isMine(item))}
            action={
              <ClaimAction
                item={item}
                actions={actions}
                className="h-9 w-full"
              />
            }
          />
        ))}
      </ItemGrid>
    ) : (
      // Under a group label, its rule already separates the list from its neighbours
      <ul className={cn("divide-y", view.groupBy === "none" && "border-y")}>
        {group.map((item) => (
          <GuestItemRow
            key={item.itemId}
            item={item}
            actions={actions}
            onOpen={() => setViewingId(item.itemId)}
          />
        ))}
      </ul>
    );

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {list.title}
      </h1>
      {list.eventDate && (
        <p className="mt-1 text-sm font-medium">
          {describeEventDate(list.eventDate)}
        </p>
      )}
      {list.description && (
        <p className="mt-2 text-muted-foreground text-pretty">
          {list.description}
        </p>
      )}

      {notice && <div className="mt-6">{notice}</div>}

      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Nothing on this list yet.
        </p>
      ) : (
        <>
          {/* First-time guests learn what Claim does, and who finds out, before they need it */}
          <p className="mt-6 text-sm text-muted-foreground text-pretty">
            Claim a gift so nobody else buys it too. Other guests see it's
            taken; the person who made this list doesn't.
            {/* The star is the owner's own mark, so guests are told what it means */}
            {anyStarred && (
              <>
                {" "}
                <StarIcon
                  aria-label="A star"
                  className="inline size-3.5 fill-current align-[-0.1em]"
                />{" "}
                marks what they'd like most.
              </>
            )}
          </p>

          {/* Coming back later, a guest's own claims are the first thing they look for */}
          {mine.length > 0 && (
            <div className="mt-6 rounded-lg border p-4">
              <h2 className="text-sm font-medium">Claimed by you</h2>
              <ul className="mt-1">
                {mine.map((item) => (
                  <li key={item.itemId}>
                    <button
                      type="button"
                      onClick={() => setViewingId(item.itemId)}
                      className="block w-full truncate py-1 text-left text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      {itemLabel(item)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {items.length >= MIN_ITEMS_FOR_GUEST_CONTROLS && (
            <div className="mt-6">
              <ListControls
                view={view}
                onChange={onViewChange}
                tags={tags}
                rankingLabel="List order"
                availableLabel={
                  items.some(isUnavailable) ? "Available" : undefined
                }
                showStarred={anyStarred}
                starredLabel="Most wanted"
                budgets={budgets}
                shownCount={shown.length}
                totalCount={items.length}
              />
            </div>
          )}

          <div className="mt-4">
            {shown.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No items match.
              </p>
            ) : view.groupBy === "none" ? (
              renderItems(shown)
            ) : (
              <GroupedItems groups={groups} render={renderItems} />
            )}
          </div>
        </>
      )}

      <ItemDetailSheet
        item={viewing}
        actions={actions}
        onClose={() => setViewingId(undefined)}
      />
    </>
  );
}
