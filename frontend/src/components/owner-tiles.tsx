import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { useState } from "react";
import {
  ItemCaption,
  ownerBadge,
  TileGrid,
  TileSquare,
} from "@/components/tile";
import { itemLabel } from "@/lib/item-view";
import type { Item } from "@/lib/owner-api";
import { useJustChanged } from "@/lib/use-just-changed";
import { cn } from "@/lib/utils";

function OwnerTile({
  item,
  sortable,
  selected,
  dimmed,
  onSelect,
}: {
  item: Item;
  sortable: boolean;
  // Open in the item panel
  selected: boolean;
  // Another item is open: this one steps back so the open one stands out
  dimmed: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.itemId, disabled: !sortable });
  // Letting go of a drag (or Space, to drop) also counts as a click; that shouldn't open the item
  const justDragged = useJustChanged(isDragging, 400);
  const state = item.got ? ", you got this" : item.starred ? ", want most" : "";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10")}
    >
      <button
        type="button"
        {...(sortable ? { ...attributes, ...listeners } : {})}
        onClick={() => !justDragged() && onSelect()}
        aria-label={`${itemLabel(item)}${state}`}
        aria-pressed={selected}
        className={cn(
          // No long-press photo menu on phones: a long press picks the tile up
          "group block w-full touch-manipulation text-left transition-opacity duration-300 select-none [-webkit-touch-callout:none]",
          sortable && "cursor-grab active:cursor-grabbing",
          dimmed
            ? "opacity-35 hover:opacity-75"
            : item.got && !selected && "opacity-45",
        )}
      >
        <TileSquare
          imageUrl={item.imageUrl}
          badge={ownerBadge(item)}
          className="group-hover:border-hairline-strong"
        />
        <ItemCaption item={item} />
      </button>
    </li>
  );
}

export function OwnerTiles({
  items,
  sortable,
  selectedId,
  onSelect,
  onMove,
  onMoveFailed,
  extra,
}: {
  items: Item[];
  // Only in the owner's own order with nothing filtered or grouped: anything else is ambiguous
  sortable: boolean;
  selectedId?: string;
  onSelect: (item: Item) => void;
  onMove: (itemId: string, position: string) => void;
  onMoveFailed: () => void;
  // After the tiles, e.g. the one being added
  extra?: React.ReactNode;
}) {
  // A mouse drags after a few pixels, so a click still opens the item. Fingers need a long
  // press, so scrolling the list never moves anything.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    // Space picks up and drops; Enter is left to open the item
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space"],
      },
    }),
  );

  // The order just dropped, shown until `items` arrives in it. The list's new order is saved
  // to the query cache a moment after the drop, and dnd-kit clears its offsets at once, so
  // without this every moved tile flashes back to its old place for a frame.
  const [dropped, setDropped] = useState<{ from: Item[]; order: Item[] }>();
  if (dropped && dropped.from !== items) setDropped(undefined);
  const shown = dropped && dropped.from === items ? dropped.order : items;

  const label = (id: string | number) => {
    const item = items.find((candidate) => candidate.itemId === id);
    return item ? itemLabel(item) : "Item";
  };
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
      setDropped({ from: items, order: reordered });
      onMove(String(active.id), position);
    } catch {
      onMoveFailed();
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            "Press Enter to open. To reorder, press Space, use the arrow keys to move, then press Space again. Press Escape to cancel.",
        },
      }}
    >
      <SortableContext
        items={shown.map((item) => item.itemId)}
        strategy={rectSortingStrategy}
      >
        <TileGrid>
          {shown.map((item) => (
            <OwnerTile
              key={item.itemId}
              item={item}
              sortable={sortable}
              selected={item.itemId === selectedId}
              dimmed={selectedId !== undefined && item.itemId !== selectedId}
              onSelect={() => onSelect(item)}
            />
          ))}
          {extra}
        </TileGrid>
      </SortableContext>
    </DndContext>
  );
}
