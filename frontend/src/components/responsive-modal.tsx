import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/use-media-query";

// Bottom sheet on phones (thumb-reachable), centred dialog on wider screens
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  footer,
  autoFocus = true,
  wrapTitle = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer: React.ReactNode;
  // Off when opening to look at something: focusing a field opens the phone keyboard
  // and selects its text, one keystroke away from replacing it
  autoFocus?: boolean;
  // Long titles (product names) get up to three lines instead of being cut off
  wrapTitle?: boolean;
  children: React.ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 640px)");

  const handleOpenAutoFocus = (event: Event) => {
    if (autoFocus) return;
    event.preventDefault();
    // Focus the modal itself, so keyboard users still start inside it
    (event.currentTarget as HTMLElement | null)?.focus();
  };

  // Radix warns without a description; hide it visually when there's nothing to say
  const descriptionClass = description ? undefined : "sr-only";
  const titleClass = wrapTitle ? "line-clamp-3 pr-8" : "truncate pr-8";

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {/* Only the body scrolls, so the footer's buttons never move */}
        <DialogContent
          className="flex max-h-[90svh] flex-col sm:max-w-md"
          onOpenAutoFocus={handleOpenAutoFocus}
        >
          <DialogHeader>
            <DialogTitle className={titleClass}>{title}</DialogTitle>
            <DialogDescription className={descriptionClass}>
              {description ?? title}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 py-1">
            {children}
          </div>
          <DialogFooter>{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90svh] rounded-t-xl pb-[env(safe-area-inset-bottom)]"
        onOpenAutoFocus={handleOpenAutoFocus}
      >
        <SheetHeader>
          <SheetTitle className={titleClass}>{title}</SheetTitle>
          <SheetDescription className={descriptionClass}>
            {description ?? title}
          </SheetDescription>
        </SheetHeader>
        {/* Only the body scrolls: the footer stays pinned to the bottom of the sheet, so a
            preview loading or a section opening never slides another button under a finger */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1">
          {children}
        </div>
        {/* One row: a secondary action (e.g. Delete) sits apart from the primary one, on its left */}
        <SheetFooter className="flex-row border-t">{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
