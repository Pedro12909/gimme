import { Link, NavLink } from "react-router";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/Pedro12909/gimme";

// Left-aligned, at most 1216px of content, 16px gutters on phones and 32px from 640px
export const container = "mx-auto w-full max-w-[1280px] px-4 sm:px-8";

// Every page: header, content, footer
export function PageShell({
  header,
  children,
  mainClassName,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  mainClassName?: string;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header
        className={cn(
          container,
          "flex min-h-14 items-center justify-between gap-4 pt-[env(safe-area-inset-top)] text-sm sm:min-h-15",
        )}
      >
        {header}
      </header>

      <main
        className={cn(container, "flex-1 pt-4 pb-16 sm:pt-8", mainClassName)}
      >
        {children}
      </main>

      <footer
        className={cn(
          container,
          "pt-6 pb-[max(24px,env(safe-area-inset-bottom))] text-[13px] text-muted",
        )}
      >
        gimme · by Pedro Portela ·{" "}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-3 hover:text-ink"
        >
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}

export function Wordmark({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="wordmark flex min-h-11 items-center">
      gimme
    </Link>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex min-h-11 items-center underline-offset-3 hover:underline",
    isActive && "underline",
  );

// Signed-in pages: the wordmark, then Lists and Account
export function OwnerHeader() {
  return (
    <>
      <Wordmark to="/lists" />
      <nav className="flex gap-6">
        <NavLink to="/lists" end className={navLink}>
          Lists
        </NavLink>
        <NavLink to="/account" className={navLink}>
          Account
        </NavLink>
      </nav>
    </>
  );
}

// "← Lists": the only glyph in the app
export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-11 min-w-0 items-center hover:underline hover:underline-offset-3"
    >
      <span className="truncate">← {children}</span>
    </Link>
  );
}
