import type { ItemGroup } from "@/lib/item-view";

// Stacked sections, each under a quiet label centred on a soft rule ("Under €25  4 items · €68").
// Labels stick under the page header while their section scrolls, so you always know which
// band you're in.
export function GroupedItems<T>({
  groups,
  render,
}: {
  groups: ItemGroup<T>[];
  render: (items: T[]) => React.ReactNode;
}) {
  return (
    <div className="grid gap-8">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2 className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 flex items-center gap-3 bg-background/90 px-4 py-2 text-sm backdrop-blur-md sm:gap-4">
            <span
              aria-hidden="true"
              className="h-px min-w-4 flex-1 bg-border/60"
            />
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-medium">{group.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {group.summary}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="h-px min-w-4 flex-1 bg-border/60"
            />
          </h2>
          <div className="mt-2">{render(group.items)}</div>
        </section>
      ))}
    </div>
  );
}
