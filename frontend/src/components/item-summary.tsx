import { ItemThumbnail } from "@/components/item-thumbnail";
import { itemDetails, itemLabel, type ViewableItem } from "@/lib/item-view";
import { safeHref, siteName } from "@/lib/links";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_TAGS = 3;

// Thumbnail, name, details, tags and other shops: the part of a row owners and guests share
export function ItemSummary({
  item,
  linkName = false,
  dimmed = false,
  children,
}: {
  item: ViewableItem;
  // Guests open the product from its name; owners tap the row to edit instead
  linkName?: boolean;
  dimmed?: boolean;
  children?: React.ReactNode;
}) {
  const href = safeHref(item.url);
  const details = itemDetails(item);
  const tags = item.tags ?? [];
  const otherShops = (item.alternatives ?? [])
    .map((link) => ({ link, href: safeHref(link) }))
    .filter((alternative) => alternative.href);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3",
        dimmed && "opacity-50",
      )}
    >
      <ItemThumbnail src={item.imageUrl} />
      <div className="min-w-0 flex-1">
        {/* Shop names can be long, so allow two lines before truncating */}
        {linkName && href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 font-medium underline-offset-4 hover:underline"
          >
            {itemLabel(item)}
          </a>
        ) : (
          <p className="line-clamp-2 font-medium">{itemLabel(item)}</p>
        )}

        {details && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {details}
          </p>
        )}

        {otherShops.length > 0 && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            Also at{" "}
            {otherShops.map((alternative, index) => (
              <span key={alternative.link}>
                {index > 0 && ", "}
                {linkName ? (
                  <a
                    href={alternative.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {siteName(alternative.link)}
                  </a>
                ) : (
                  siteName(alternative.link)
                )}
              </span>
            ))}
          </p>
        )}

        {tags.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Tags">
            {tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </li>
            ))}
            {tags.length > MAX_VISIBLE_TAGS && (
              <li className="px-1 py-0.5 text-xs text-muted-foreground">
                +{tags.length - MAX_VISIBLE_TAGS}
              </li>
            )}
          </ul>
        )}

        {children}
      </div>
    </div>
  );
}
