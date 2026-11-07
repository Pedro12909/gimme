import { useRef, useState } from "react";
import { Modal } from "@/components/modal";

// A bottom sheet over a scrim, for phones. Dragging its top edge down past a threshold, or
// Escape, closes it.
export function Sheet({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | undefined>(undefined);

  const grabber = {
    onPointerDown: (event: React.PointerEvent) => {
      start.current = event.clientY;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (start.current === undefined) return;
      setOffset(Math.max(0, event.clientY - start.current));
    },
    onPointerUp: () => {
      if (offset > 90) onClose();
      start.current = undefined;
      setDragging(false);
      setOffset(0);
    },
    onPointerCancel: () => {
      start.current = undefined;
      setDragging(false);
      setOffset(0);
    },
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={labelledBy}
      className="animate-sheet-up inset-x-0 top-auto bottom-0 max-h-[92svh] w-full max-w-none overflow-y-auto rounded-t-lg bg-ground shadow-sheet"
    >
      <div
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          transition: dragging ? "none" : "transform 0.2s",
        }}
      >
        <div
          {...grabber}
          aria-hidden="true"
          className="flex h-6 touch-none items-center justify-center"
        >
          <span className="h-1 w-9 rounded-full bg-hairline-strong" />
        </div>
        <div className="px-5 pb-[max(28px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </Modal>
  );
}
