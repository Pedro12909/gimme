import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/Pedro12909/gimme";

// Every page: sticky header, content column, footer
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
      {/* Stays reachable while scrolling long lists; the blur keeps it from feeling heavy */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-2 px-4">
          {header}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full max-w-2xl flex-1 px-4 pt-8 pb-16",
          mainClassName,
        )}
      >
        {children}
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground">
          <span className="font-semibold tracking-tight text-foreground">
            gimme
          </span>
          <span aria-hidden="true">·</span>
          <span>by Pedro Portela</span>
          <span aria-hidden="true">·</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
