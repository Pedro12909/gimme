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
import { ItemCaption, TileGrid, TileSquare } from "@/components/tile";
import { itemLabel } from "@/lib/item-view";
import type { Item } from "@/lib/owner-api";
import { useJustChanged } from "@/lib/use-just-changed";
import { cn } from "@/lib/utils";

function OwnerTile({
  item,
  sortable,
  editing,
  dimmed,
  onEdit,
}: {
  item: Item;
  sortable: boolean;
  editing: boolean;
  // Another item is open in the edit panel
  dimmed: boolean;
  onEdit: () => void;
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

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10", dimmed && "lg:opacity-45")}
    >
      <button
        type="button"
        {...(sortable ? { ...attributes, ...listeners } : {})}
        onClick={() => !justDragged() && onEdit()}
        aria-label={`Edit ${itemLabel(item)}`}
        aria-current={editing || undefined}
        className={cn(
          // No long-press photo menu on phones: a long press picks the tile up
          "block w-full touch-manipulation select-none [-webkit-touch-callout:none]",
          sortable && "cursor-grab active:cursor-grabbing",
          editing && "outline outline-1 outline-offset-4 outline-ink",
        )}
      >
        <TileSquare
          imageUrl={item.imageUrl}
          veil={item.got ? "You got this" : undefined}
        />
      </button>
      <ItemCaption item={item} muted={item.got} />
    </li>
  );
}

export function OwnerTiles({
  items,
  sortable,
  editingId,
  narrow,
  onEdit,
  onMove,
  onMoveFailed,
  extra,
}: {
  items: Item[];
  // Only in the owner's own order with nothing filtered or grouped: anything else is ambiguous
  sortable: boolean;
  editingId?: string;
  narrow: boolean;
  onEdit: (item: Item) => void;
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
            "Press Enter to edit. To reorder, press Space, use the arrow keys to move, then press Space again. Press Escape to cancel.",
        },
      }}
    >
      <SortableContext
        items={items.map((item) => item.itemId)}
        strategy={rectSortingStrategy}
      >
        <TileGrid narrow={narrow}>
          {items.map((item) => (
            <OwnerTile
              key={item.itemId}
              item={item}
              sortable={sortable}
              editing={item.itemId === editingId}
              dimmed={editingId !== undefined && item.itemId !== editingId}
              onEdit={() => onEdit(item)}
            />
          ))}
          {extra}
        </TileGrid>
      </SortableContext>
    </DndContext>
  );
}
