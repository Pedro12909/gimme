import { useEffect, useRef } from "react";
import { Icon } from "@/components/icon";

// Filters the shelf by name and shop as the owner types. Search only: adding has its own
// way in. ⌘K / Ctrl+K reaches it from anywhere.
export function SearchBox({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="search"
      // The focus ring goes round the whole box
      className="flex h-[46px] items-center gap-2.5 rounded-card bg-surface px-3.5 outline-offset-2 outline-ink has-[input:focus-visible]:outline-2 lg:h-12"
    >
      <Icon name="search" size={18} className="text-muted" />
      <input
        ref={input}
        type="search"
        aria-label="Search items"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search"
        // Not on phones, where it would cover the page with the keyboard
        autoFocus={autoFocus && window.matchMedia("(pointer: fine)").matches}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value !== "") {
            event.stopPropagation();
            onChange("");
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted lg:text-[15px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
          className="flex size-7 flex-none items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Icon name="close" size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
