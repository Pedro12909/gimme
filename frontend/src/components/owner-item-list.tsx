import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { ExternalLinkIcon, GripVerticalIcon } from "lucide-react";
import { toast } from "sonner";
import { ItemSummary } from "@/components/item-summary";
import { Button } from "@/components/ui/button";
import { itemLabel } from "@/lib/item-view";
import { safeHref } from "@/lib/links";
import type { Item } from "@/lib/owner-api";
import { cn } from "@/lib/utils";

function OwnerItemRow({
  item,
  onEdit,
  handle,
  rowRef,
  style,
  dragging = false,
}: {
  item: Item;
  onEdit: () => void;
  handle?: React.ReactNode;
  rowRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
  dragging?: boolean;
}) {
  const href = safeHref(item.url);

  return (
    <li
      ref={rowRef}
      style={style}
      className={cn(
        "relative flex items-center gap-1 bg-background",
        dragging && "z-10 rounded-md shadow-lg ring-1 ring-border",
      )}
    >
      {handle}
      {/* Tapping the row edits it; the link icon is for checking the product page */}
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          "flex min-w-0 flex-1 rounded-md py-3 pr-1 text-left hover:bg-muted/50",
          handle ? "pl-1" : "-ml-2 pl-2",
        )}
      >
        <ItemSummary item={item} dimmed={item.got}>
          {item.got && (
            <p className="mt-0.5 text-sm text-muted-foreground">Got it</p>
          )}
        </ItemSummary>
      </button>
      {href && (
        <Button
          asChild
          variant="ghost"
          size="icon-lg"
          aria-label={`Open ${itemLabel(item)}`}
        >
          <a href={href} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon className="text-muted-foreground" />
          </a>
        </Button>
      )}
    </li>
  );
}

function SortableItemRow({ item, onEdit }: { item: Item; onEdit: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.itemId });

  return (
    <OwnerItemRow
      item={item}
      onEdit={onEdit}
      rowRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      dragging={isDragging}
      handle={
        // Dragging starts from the handle only, so scrolling the list on a phone never moves items.
        // touch-none hands the gesture to the drag instead of the page scroll.
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${itemLabel(item)}`}
          className="-ml-2 flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-4" />
        </button>
      }
    />
  );
}

export function OwnerItemList({
  items,
  sortable,
  grouped = false,
  onEdit,
  onMove,
}: {
  items: Item[];
  // Only in the owner's own order with no filters: dragging in a filtered or re-sorted view is ambiguous
  sortable: boolean;
  // Under a group label, whose rule already separates this list from its neighbours
  grouped?: boolean;
  onEdit: (item: Item) => void;
  onMove: (itemId: string, position: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (!sortable) {
    return (
      <ul className={cn("divide-y", !grouped && "border-y")}>
        {items.map((item) => (
          <OwnerItemRow
            key={item.itemId}
            item={item}
            onEdit={() => onEdit(item)}
          />
        ))}
      </ul>
    );
  }

  const label = (id: string | number) =>
    itemLabel(
      items.find((item) => item.itemId === id) ?? {
        itemId: "",
        url: "",
        createdAt: "",
      },
    );
  const place = (id: string | number) =>
    `position ${items.findIndex((item) => item.itemId === id) + 1} of ${items.length}`;

  // Screen readers hear item names, not internal IDs
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${label(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${label(active.id)} is over ${place(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${label(active.id)} was dropped at ${place(over.id)}.`
        : `${label(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${label(active.id)} was cancelled.`,
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const from = items.findIndex((item) => item.itemId === active.id);
    const to = items.findIndex((item) => item.itemId === over.id);
    const reordered = arrayMove(items, from, to);

    // The moved item gets a key between its new neighbours; nothing else changes
    try {
      const position = generateKeyBetween(
        reordered[to - 1]?.position ?? null,
        reordered[to + 1]?.position ?? null,
      );
      onMove(String(active.id), position);
    } catch {
      toast.error("Couldn't move the item. Reload the list and try again.");
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "To reorder, press Space or Enter, use the arrow keys to move, then press Space or Enter again. Press Escape to cancel.",
        },
      }}
    >
      <SortableContext
        items={items.map((item) => item.itemId)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="divide-y border-y">
          {items.map((item) => (
            <SortableItemRow
              key={item.itemId}
              item={item}
              onEdit={() => onEdit(item)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
