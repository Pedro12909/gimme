import { useState } from "react";
import { cn } from "@/lib/utils";

// An action that can't be undone asks once more, in place: "Remove it? Remove · Keep it"
export function ConfirmAction({
  label,
  question,
  confirmLabel,
  keepLabel = "Keep it",
  onConfirm,
  busy = false,
  destructive = true,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  keepLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  destructive?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const tone = destructive && "text-accent";

  if (!asking) {
    return (
      <button
        type="button"
        className={cn("action", tone)}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-4">
      <span>{question}</span>
      <button
        type="button"
        className={cn("action", tone)}
        onClick={onConfirm}
        disabled={busy}
      >
        {busy ? "One moment…" : confirmLabel}
      </button>
      <button
        type="button"
        className="action"
        onClick={() => setAsking(false)}
        disabled={busy}
      >
        {keepLabel}
      </button>
    </span>
  );
}
