import { useState } from "react";
import { Icon } from "@/components/icon";
import { itemLabel, itemMeta, type ViewableItem } from "@/lib/item-view";
import { cn } from "@/lib/utils";

// An item's state, shown as a badge in the photo's top-right corner. "got" covers the
// owner's Got it and the guest's Taken: the tile also fades.
export type TileBadge = "want" | "got";

function Badge({ badge }: { badge: TileBadge }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-2 right-2 flex size-6 items-center justify-center rounded-full",
        badge === "want"
          ? "bg-accent text-accent-on"
          : "border-[1.5px] border-ink bg-ground text-ink",
      )}
    >
      <Icon name={badge === "want" ? "star" : "check"} size={13} />
    </span>
  );
}

// The square: the product photo on white with a hairline edge, or an empty square
export function TileSquare({
  imageUrl,
  badge,
  className,
}: {
  imageUrl?: string;
  badge?: TileBadge;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const showImage = imageUrl && failedUrl !== imageUrl;

  return (
    <span
      className={cn(
        "tile-square relative block aspect-square overflow-hidden rounded-card border border-hairline",
        showImage ? "bg-photo" : "bg-surface",
        className,
      )}
    >
      {/* No photo, or it didn't load: a gift stands in */}
      {!showImage && (
        <span className="absolute inset-0 flex items-center justify-center text-meta">
          <Icon
            name="gift"
            size={36}
            strokeWidth={1.4}
            className="h-auto w-[28%]"
          />
        </span>
      )}
      {showImage && (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          draggable={false}
          // Shops don't need to know which list (or share link) the image was viewed from
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
          className="size-full object-contain p-[10%]"
        />
      )}
      {badge && <Badge badge={badge} />}
    </span>
  );
}

// Got wins over Want when both are set
export const ownerBadge = (item: ViewableItem): TileBadge | undefined =>
  item.got ? "got" : item.starred ? "want" : undefined;

// Name on one line, then "shop · price"
export function ItemCaption({
  item,
  meta,
  children,
}: {
  item: ViewableItem;
  // In place of "shop · price", e.g. "Taken"
  meta?: string;
  // Lines below, e.g. the guest's Claim
  children?: React.ReactNode;
}) {
  const line = meta ?? itemMeta(item);

  return (
    <div className="flex flex-col gap-0.5 pt-2.5">
      <p className="truncate text-sm font-medium group-hover:underline group-hover:underline-offset-3">
        {itemLabel(item)}
      </p>
      {line && (
        <p className="truncate text-[13px] text-muted tabular-nums">{line}</p>
      )}
      {children}
    </div>
  );
}

// The shelf: two columns on phones; from 768px, as many fixed-size tiles as fit. Fixed, so
// opening the item panel drops a column instead of resizing every tile.
export function TileGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "dock grid grid-cols-2 gap-x-3 gap-y-[22px] md:grid-cols-[repeat(auto-fill,var(--tile-size))] md:gap-x-5 md:gap-y-7",
        className,
      )}
    >
      {children}
    </ul>
  );
}
