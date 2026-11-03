import type { ItemGroup } from "@/lib/item-view";

// Stacked sections, each under a quiet caption: "Under €25 · 4 things · €68"
export function GroupedItems<T>({
  groups,
  render,
}: {
  groups: ItemGroup<T>[];
  render: (items: T[]) => React.ReactNode;
}) {
  return (
    <div className="grid gap-10">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h2 className="mb-3 text-sm">
            <span className="font-medium">{group.label}</span>
            <span className="text-muted"> · {group.summary}</span>
          </h2>
          {render(group.items)}
        </section>
      ))}
    </div>
  );
}
