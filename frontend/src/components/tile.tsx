import { useState } from "react";
import { itemLabel, itemMeta, type ViewableItem } from "@/lib/item-view";
import { cn } from "@/lib/utils";

// The square: the product photo on white, or an empty tile. A veil greys it out with a few
// words bottom-left, which is how an item's state is shown ("Taken", "You got this").
export function TileSquare({
  imageUrl,
  veil,
  className,
}: {
  imageUrl?: string;
  veil?: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const showImage = imageUrl && failedUrl !== imageUrl;

  return (
    <span
      className={cn(
        "relative block aspect-square overflow-hidden",
        showImage ? "bg-photo" : "bg-tile",
        className,
      )}
    >
      {showImage && (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          draggable={false}
          // Shops don't need to know which list (or share link) the image was viewed from
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
          className="size-full object-contain"
        />
      )}
      {veil && (
        <>
          <span className="absolute inset-0 bg-veil" />
          <span className="absolute right-2.5 bottom-2 left-2.5 text-left text-[13px] font-medium text-ink sm:bottom-2.5 sm:left-3">
            {veil}
          </span>
        </>
      )}
    </span>
  );
}

// Name, then "shop · price", then "Want most". Phones run the grid edge to edge, so the
// caption keeps its own left padding there.
export function ItemCaption({
  item,
  muted = false,
  children,
}: {
  item: ViewableItem;
  // Greyed with its tile, e.g. "You got this"
  muted?: boolean;
  // Lines below, e.g. the guest's Claim
  children?: React.ReactNode;
}) {
  const meta = itemMeta(item);

  return (
    <div className="pt-2 pr-2.5 pl-3 sm:pt-2.5 sm:pr-3 sm:pl-0">
      <p
        className={cn(
          "line-clamp-3 text-sm leading-[1.3] font-medium sm:text-[15px]",
          muted && "text-muted",
        )}
      >
        {itemLabel(item)}
      </p>
      {meta && (
        <p className="mt-0.5 text-xs text-muted sm:mt-1 sm:text-[13px]">
          {meta}
        </p>
      )}
      {item.starred && (
        <p className="mt-0.5 text-xs font-medium text-accent sm:mt-1 sm:text-[13px]">
          Want most
        </p>
      )}
      {children}
    </div>
  );
}

// 2 columns on phones (edge to edge), 3 from 640px, 4 from 1024px unless `narrow`
export function TileGrid({
  narrow = false,
  children,
}: {
  // Room for the edit panel beside it
  narrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ul
      className={cn(
        "-mx-4 grid grid-cols-2 gap-x-0.5 gap-y-6 sm:mx-0 sm:grid-cols-3 lg:gap-y-8",
        !narrow && "lg:grid-cols-4",
      )}
    >
      {children}
    </ul>
  );
}
