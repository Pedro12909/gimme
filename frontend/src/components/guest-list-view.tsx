import { useMemo } from "react";
import { GroupedItems } from "@/components/grouped-items";
import {
  ListControls,
  MIN_ITEMS_FOR_GUEST_CONTROLS,
} from "@/components/list-controls";
import { ItemCaption, TileGrid, TileSquare } from "@/components/tile";
import { formatEventDate, relativeEventDate } from "@/lib/event-date";
import type { SharedItem, SharedList } from "@/lib/guest-api";
import {
  applyView,
  budgetOptions,
  collectTags,
  groupItems,
  isUnavailable,
  itemLabel,
  type ListView,
} from "@/lib/item-view";
import { safeHref, siteName } from "@/lib/links";
import { useJustChanged } from "@/lib/use-just-changed";

// What a guest sees of a list. Used by the shared link itself and by the owner's preview,
// which passes items with every claim left out.

export type GuestActions = {
  onClaim: (item: SharedItem) => void;
  onUnclaim: (item: SharedItem) => void;
  // The item being released right now, if any
  unclaimingId?: string;
  // The item whose release just failed, if any
  unclaimFailedId?: string;
  // Claimed from this browser, so this guest can release it
  isMine: (item: SharedItem) => boolean;
};

// "Pedro's list", top right on the guest page
export function WhoseList({ ownerName }: { ownerName?: string }) {
  if (!ownerName) return null;
  return (
    <span className="truncate text-[13px] text-muted">{ownerName}'s list</span>
  );
}

// Why an item can't be claimed, shown on its tile
function veilText(item: SharedItem, ownerName: string | undefined) {
  if (item.got) return ownerName ? `${ownerName} has it` : "They have it";
  if (item.claimed) {
    return item.claimerName ? `Taken by ${item.claimerName}` : "Taken";
  }
  return undefined;
}

function GuestTile({
  item,
  actions,
  ownerName,
}: {
  item: SharedItem;
  actions: GuestActions;
  ownerName?: string;
}) {
  const mine = item.claimed && actions.isMine(item);
  // Their own claim isn't greyed out: it's the one they still have to go and buy
  const veil = mine ? undefined : veilText(item, ownerName);
  const href = safeHref(item.url);
  const otherShops = (item.alternatives ?? [])
    .map((link) => ({ link, href: safeHref(link) }))
    .filter((shop) => shop.href);
  // Claim and Undo swap places after each tap, so a double tap is ignored for a moment
  // rather than undoing what the first tap did
  const tooSoon = useJustChanged(`${item.claimed}:${mine}`);
  const square = <TileSquare imageUrl={item.imageUrl} veil={veil} />;

  return (
    <li>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${itemLabel(item)} in the shop`}
          className="block"
        >
          {square}
        </a>
      ) : (
        square
      )}
      <ItemCaption item={item} muted={veil !== undefined}>
        {item.note && (
          <p className="mt-1 text-xs whitespace-pre-line text-muted sm:text-[13px]">
            {item.note}
          </p>
        )}
        {otherShops.length > 0 && (
          <p className="mt-1 text-xs text-muted sm:text-[13px]">
            Also at{" "}
            {otherShops.map((shop, index) => (
              <span key={shop.link}>
                {index > 0 && ", "}
                <a
                  href={shop.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-3 hover:text-ink"
                >
                  {siteName(shop.link)}
                </a>
              </span>
            ))}
          </p>
        )}
        {mine ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-accent">Yours</span>
            <button
              type="button"
              className="action text-muted"
              disabled={actions.unclaimingId === item.itemId}
              onClick={() => !tooSoon() && actions.onUnclaim(item)}
            >
              {actions.unclaimingId === item.itemId ? "Undoing…" : "Undo"}
            </button>
          </div>
        ) : (
          !isUnavailable(item) && (
            <button
              type="button"
              className="action text-sm font-medium"
              onClick={() => !tooSoon() && actions.onClaim(item)}
            >
              Claim
            </button>
          )
        )}
        {actions.unclaimFailedId === item.itemId && (
          <p role="alert" className="text-xs font-medium sm:text-[13px]">
            Couldn't undo. Try again.
          </p>
        )}
      </ItemCaption>
    </li>
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
  list: Pick<SharedList, "title" | "description" | "eventDate" | "ownerName">;
  items: SharedItem[];
  actions: GuestActions;
  view: ListView;
  onViewChange: (view: ListView) => void;
  // Shown under the intro, e.g. the owner's preview note
  notice?: React.ReactNode;
}) {
  const tags = useMemo(() => collectTags(items), [items]);
  const budgets = useMemo(() => budgetOptions(items), [items]);
  // Claimed from this browser
  const mine = useMemo(
    () => items.filter((item) => item.claimed && actions.isMine(item)),
    [items, actions],
  );
  // Items arrive in the owner's order; what can't be claimed goes last whichever sort is
  // chosen. A guest's own claims stay put, so an item doesn't move as they claim it.
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

  const date =
    list.eventDate &&
    [formatEventDate(list.eventDate), relativeEventDate(list.eventDate)]
      .filter(Boolean)
      .join(" · ");

  const renderTiles = (group: SharedItem[]) => (
    <TileGrid>
      {group.map((item) => (
        <GuestTile
          key={item.itemId}
          item={item}
          actions={actions}
          ownerName={list.ownerName}
        />
      ))}
    </TileGrid>
  );

  return (
    <>
      <h1 className="page-title">{list.title}</h1>
      {date && <p className="mt-2.5 text-sm text-muted">{date}</p>}
      <div className="max-w-[560px] text-sm leading-[1.45]">
        {list.description && (
          <p className="mt-3.5 whitespace-pre-line">{list.description}</p>
        )}
        {/* First-time guests learn what Claim does, and who finds out, before they need it */}
        {items.length > 0 && (
          <p className="mt-3.5">
            Claim something so nobody doubles up.{" "}
            {list.ownerName ?? "The person who made this list"} won't see who.
          </p>
        )}
      </div>

      {notice && <div className="mt-3 max-w-[560px]">{notice}</div>}

      {items.length === 0 ? (
        <p className="mt-8 text-muted">Nothing on this list yet.</p>
      ) : (
        <>
          {items.length >= MIN_ITEMS_FOR_GUEST_CONTROLS && (
            <div className="mt-4">
              <ListControls
                view={view}
                onChange={onViewChange}
                tags={tags}
                rankingLabel="List order"
                availableLabel={
                  items.some(isUnavailable) ? "Available" : undefined
                }
                showStarred={items.some((item) => item.starred)}
                budgets={budgets}
                shownCount={shown.length}
                totalCount={items.length}
              />
            </div>
          )}

          <div className="mt-5">
            {shown.length === 0 ? (
              <p className="text-muted">Nothing matches.</p>
            ) : view.groupBy === "none" ? (
              renderTiles(shown)
            ) : (
              <GroupedItems groups={groups} render={renderTiles} />
            )}
          </div>
        </>
      )}
    </>
  );
}
