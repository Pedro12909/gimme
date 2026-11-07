import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// A popover menu anchored to its button. Escape, a click outside or a choice closes it and
// puts focus back on the button. Arrow keys move between items.

type MenuContextValue = { close: () => void };
const MenuContext = createContext<MenuContextValue>({ close: () => {} });

export function Menu({
  trigger,
  children,
  align = "end",
  side = "bottom",
  className,
  label,
}: {
  // The button that opens it; given the props it needs
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
  }) => React.ReactNode;
  children: React.ReactNode;
  // Which edge of the button the menu lines up with
  align?: "start" | "end";
  // "top" opens upward, as the account menu at the bottom of the sidebar does
  side?: "top" | "bottom";
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // The first item takes focus, so the keyboard can go on from there
    panel.current
      ?.querySelector<HTMLElement>("[role^=menuitem]:not(:disabled)")
      ?.focus();

    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !panel.current?.contains(target) &&
        !button.current?.contains(target)
      ) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, close]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      // Only the menu closes, not the panel or sheet behind it
      event.stopPropagation();
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      panel.current?.querySelectorAll<HTMLElement>(
        "[role^=menuitem]:not(:disabled)",
      ) ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[next]?.focus();
  };

  return (
    <div className="relative">
      {trigger({
        ref: button,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": id,
        onClick: () => setOpen((current) => !current),
      })}
      {open && (
        <div
          ref={panel}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cn(
            "menu absolute z-40",
            side === "bottom"
              ? "animate-menu-down top-full mt-1.5"
              : "animate-menu-up bottom-full mb-1.5",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          <MenuContext value={{ close }}>{children}</MenuContext>
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onSelect,
  children,
  checked,
  disabled,
  keepOpen = false,
  className,
}: {
  onSelect?: () => void;
  children: React.ReactNode;
  // For a choice among several, e.g. a sort order
  checked?: boolean;
  disabled?: boolean;
  // A two-step item stays open after the first press
  keepOpen?: boolean;
  className?: string;
}) {
  const { close } = useContext(MenuContext);
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      disabled={disabled}
      className={cn("menu-item", className)}
      onClick={() => {
        onSelect?.();
        if (!keepOpen) close();
      }}
    >
      {children}
    </button>
  );
}

// Plain text inside a menu, such as "Your only list can't be deleted."
export function MenuNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-10 items-center px-2.5 text-[13px] text-muted">
      {children}
    </p>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-2 pb-1 text-[13px] font-semibold text-muted">
      {children}
    </p>
  );
}

export function MenuDivider() {
  return <hr className="mx-1 my-1.5 border-hairline" />;
}

export const useMenu = () => useContext(MenuContext);
