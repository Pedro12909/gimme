import { useId } from "react";
import { cn } from "@/lib/utils";

// An on/off setting with a label and a short explanation, as one tappable row
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: React.ReactNode;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-description` : undefined}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-4 rounded-md py-1 text-left"
    >
      <span className="min-w-0 flex-1">
        <span
          id={`${id}-label`}
          className="flex items-center gap-1.5 text-sm font-medium"
        >
          {label}
        </span>
        {description && (
          <span
            id={`${id}-description`}
            className="mt-0.5 block text-sm text-muted-foreground text-pretty"
          >
            {description}
          </span>
        )}
      </span>
      {/* The switch itself: greyscale, filled when on */}
      <span
        aria-hidden="true"
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-foreground" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow-sm transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}
