import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// A native modal <dialog>: the browser traps focus, makes the page behind inert and closes it
// on Escape. Its content only exists while it's open, so each opening starts fresh.
export function Modal({
  open,
  onClose,
  labelledBy,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Focus the dialog itself, not its first field: that would open the phone keyboard
      dialog.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={labelledBy}
      // Escape: let the page decide, so its state and the dialog never disagree
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself is a click on the scrim around the content
      onClick={(event) => event.target === event.currentTarget && onClose()}
      // Size, place and background come from the caller
      className={cn("m-0 border-0 p-0 text-ink outline-none", className)}
    >
      {open && children}
    </dialog>
  );
}
