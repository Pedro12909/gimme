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
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 640px)");

  // Radix warns without a description; hide it visually when there's nothing to say
  const descriptionClass = description ? undefined : "sr-only";

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{title}</DialogTitle>
            <DialogDescription className={descriptionClass}>
              {description ?? title}
            </DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90svh] overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle className="truncate pr-8">{title}</SheetTitle>
          <SheetDescription className={descriptionClass}>
            {description ?? title}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4">{children}</div>
        {/* Same order as the dialog footer: primary action ends up on top */}
        <SheetFooter className="flex-col-reverse">{footer}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
