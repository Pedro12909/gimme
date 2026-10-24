import { useId } from "react";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";

// A modal holding one form. The submit button sits in the modal footer, outside the
// <form> element, so it's linked to the form by id.
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
  autoFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  submitLabel: string;
  submitting: boolean;
  canSubmit?: boolean;
  onSubmit: () => void;
  secondaryAction?: React.ReactNode;
  autoFocus?: boolean;
  children: React.ReactNode;
}) {
  const formId = useId();

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      autoFocus={autoFocus}
      footer={
        <>
          {secondaryAction}
          <Button
            type="submit"
            form={formId}
            size="lg"
            className="h-11 flex-1 sm:h-9 sm:flex-none"
            disabled={submitting || !canSubmit}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-5"
        // Each form explains its own mistakes, in its own words, next to the field
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
      </form>
    </ResponsiveModal>
  );
}
