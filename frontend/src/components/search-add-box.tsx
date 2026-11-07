import { useEffect, useRef } from "react";
import { Icon } from "@/components/icon";
import { siteName } from "@/lib/links";
import { cn } from "@/lib/utils";

// Text that is a link (it may come wrapped in words, as shop apps share it)
export const isLink = (text: string) => /^https?:\/\//i.test(text.trim());

// One box for both: plain text filters the shelf by name and shop; a link shows
// "Add from {shop}" inside the box, and Enter does the same.
export function SearchAddBox({
  value,
  onChange,
  onAdd,
  adding,
  canAdd,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: (link: string) => void;
  adding: boolean;
  // False when the list is full: links are then only searched
  canAdd: boolean;
  autoFocus?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const link = canAdd && isLink(value) ? value.trim() : undefined;

  // ⌘K / Ctrl+K reaches the box from anywhere
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
    <form
      role="search"
      noValidate
      // The focus ring goes round the whole box
      className="flex h-[46px] items-center gap-2.5 rounded-card bg-surface pr-1.5 pl-3.5 outline-offset-2 outline-ink has-[input:focus-visible]:outline-2 lg:h-12"
      onSubmit={(event) => {
        event.preventDefault();
        if (link && !adding) onAdd(link);
      }}
    >
      <Icon name="search" size={18} className="text-muted" />
      <label htmlFor="search-add" className="sr-only">
        Search, or paste a link to add
      </label>
      <input
        ref={input}
        id="search-add"
        type="text"
        inputMode="search"
        enterKeyHint={link ? "go" : "search"}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search, or paste a link to add"
        // Not on phones, where it would cover the page with the keyboard
        autoFocus={autoFocus && window.matchMedia("(pointer: fine)").matches}
        value={value}
        disabled={adding}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value !== "") {
            event.stopPropagation();
            onChange("");
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted lg:text-[15px]"
      />
      {link && (
        <button
          type="submit"
          disabled={adding}
          className={cn(
            "flex h-9 max-w-[60%] flex-none items-center gap-1.5 rounded-sm bg-accent px-3 text-sm font-semibold text-accent-on hover:bg-accent-hover disabled:opacity-60",
          )}
        >
          <Icon name="plus" size={16} />
          <span className="truncate">
            {adding ? "Adding…" : `Add from ${siteName(link)}`}
          </span>
        </button>
      )}
    </form>
  );
}
