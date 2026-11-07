import { forwardRef } from "react";
import { cn } from "@/lib/utils";

// The app's only icons (design/home-redesign.md, section 8). No icon library: a few
// hand-picked strokes keep the UI from looking generated.
const PATHS = {
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  star: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.5 6.7L12 17.3l-6.1 3.4 1.5-6.7-5.1-4.6 6.8-.7z"
    />
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.2 12.3l2.6 2.6 5-5.4" />
    </>
  ),
  check: <path d="M6 12.5l4 4 8-9" />,
  home: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6.5 10v9h11v-9" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  share: (
    <>
      <path d="M12 3.5v11" />
      <path d="M8 7.5l4-4 4 4" />
      <path d="M6 11.5v8h12v-8" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  open: (
    <>
      <path d="M8 16 16 8" />
      <path d="M9.5 8H16v6.5" />
    </>
  ),
  // Copy to another list (there's no move: an item's claim stays with it)
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </>
  ),
  // On the panel's photo: it can be changed
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 15.5l-5-5-9 8.5" />
    </>
  ),
  // Stands in for a missing or broken product photo
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="4.5" rx="1" />
      <path d="M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6.5" />
      <path d="M12 8v12.5" />
      <path d="M12 8C10.5 5 6.5 4.2 6.5 6.4 6.5 8 10 8 12 8z" />
      <path d="M12 8c1.5-3 5.5-3.8 5.5-1.6C17.5 8 14 8 12 8z" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M10 7V5h4v2" />
      <path d="M7 7l1 12h8l1-12" />
    </>
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  strokeWidth,
  className,
}: {
  name: IconName;
  size?: number;
  // A small check needs a heavier stroke to read (2.4–2.6 at 13–15px)
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? (name === "check" && size <= 15 ? 2.5 : 1.8)}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("flex-none", className)}
    >
      {PATHS[name]}
    </svg>
  );
}

// 40×40 (32 small, 44 on touch). The label is both the accessible name and the tooltip.
export const IconButton = forwardRef<
  HTMLButtonElement,
  {
    icon: IconName;
    label: string;
    small?: boolean;
    className?: string;
  } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">
>(function IconButton({ icon, label, small, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={props.title ?? label}
      className={cn("icon-button", small && "small", className)}
      {...props}
    >
      <Icon name={icon} size={small ? 18 : 20} />
    </button>
  );
});
