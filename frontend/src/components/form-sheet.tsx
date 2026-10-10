import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// A bottom sheet holding one form: thumb-reachable on phones, centred on wider screens
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitting,
  canSubmit = true,
  onSubmit,
  secondaryAction,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  submitLabel: string
  submitting: boolean
  canSubmit?: boolean
  onSubmit: () => void
  secondaryAction?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90svh] max-w-xl overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <SheetHeader>
            <SheetTitle className="pr-8">{title}</SheetTitle>
            {/* Radix warns without a description; hide it visually when there's nothing to say */}
            <SheetDescription className={description ? undefined : "sr-only"}>
              {description ?? title}
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-5 px-4">{children}</div>

          <SheetFooter>
            <Button
              type="submit"
              size="lg"
              className="h-11"
              disabled={submitting || !canSubmit}
            >
              {submitLabel}
            </Button>
            {secondaryAction}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
